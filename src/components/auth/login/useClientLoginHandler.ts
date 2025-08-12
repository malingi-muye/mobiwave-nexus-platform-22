import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function useClientLoginHandler() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (identifier: string, password: string) => {
    setError('');
    setIsLoading(true);

    try {
      // Authenticate using client_profiles table via RPC function
      const { data: clientProfiles, error: clientError } = await supabase
        .rpc('authenticate_client_profile', {
          login_identifier: identifier,
          login_password: password
        });

      if (clientError) {
        throw clientError;
      }

      if (!clientProfiles || clientProfiles.length === 0) {
        throw new Error('Invalid credentials');
      }

      const clientProfile = clientProfiles[0];

      // Check if client is active
      if (!clientProfile.is_active) {
        throw new Error('Account is deactivated. Please contact support.');
      }

      // Update last login
      await supabase
        .from('client_profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', clientProfile.id);

      // Fetch additional client profile data including username and sms_balance
      const { data: fullClientProfile, error: profileError } = await supabase
        .from('client_profiles')
        .select('username, sms_balance, phone, metadata')
        .eq('id', clientProfile.id)
        .single();

      if (profileError) {
        console.error('Error fetching full client profile:', profileError);
      }

      // Store client profile session in localStorage for routing
      const sessionData = {
        user_id: clientProfile.user_id,
        email: clientProfile.email,
        client_name: clientProfile.client_name,
        username: fullClientProfile?.username || clientProfile.username,
        sms_balance: fullClientProfile?.sms_balance || 0,
        phone: fullClientProfile?.phone || clientProfile.phone,
        role: 'user',
        user_type: 'client',
        is_active: clientProfile.is_active,
        authenticated_at: new Date().toISOString(),
        metadata: fullClientProfile?.metadata || {}
      };

      localStorage.setItem('client_session', JSON.stringify(sessionData));
      
      toast.success('Client login successful!');
      
      // Force page refresh to trigger auth state check with stored session
      window.location.href = '/dashboard';
      
    } catch (error: unknown) {
      console.error('Client login error:', error);
      
      const errorMessage = (error as Error).message;
      
      if (errorMessage.includes('Invalid credentials') || errorMessage.includes('authentication failed')) {
        setError('Invalid email/username or password');
      } else if (errorMessage.includes('deactivated')) {
        setError(errorMessage);
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    handleSubmit
  };
}