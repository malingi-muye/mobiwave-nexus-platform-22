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
      // Authenticate using Supabase Edge Function (server-side bcrypt check)
      const { data, error } = await supabase.functions.invoke('authenticate-client-profile', {
        body: { identifier, password }
      });

      if (error) {
        throw error;
      }

      // The function returns { profile, token, expires_at }
      const clientProfile = data?.profile;
      const token: string | undefined = data?.token;
      const expiresAt: number | undefined = data?.expires_at;

      if (!clientProfile || !token || !expiresAt) {
        throw new Error('Invalid credentials');
      }

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

      // Store signed client session in localStorage for routing
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
        metadata: fullClientProfile?.metadata || {},
        token,
        expires_at: expiresAt
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