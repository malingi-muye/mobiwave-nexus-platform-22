import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function useAdminLoginHandler() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountLocked, setAccountLocked] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (email: string, password: string) => {
    setError('');
    setIsLoading(true);
    setAccountLocked(false);

    try {
      // Authenticate using Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Authentication failed');
      }

      // Check if user has admin profile
      const { data: adminProfile, error: adminError } = await supabase
        .from('admin_profiles')
        .select('role, user_id')
        .eq('user_id', authData.user.id)
        .single();

      if (adminError || !adminProfile) {
        // Sign out the user since they don't have admin access
        await supabase.auth.signOut();
        throw new Error('Access denied. Admin privileges required.');
      }

      // Verify role is admin or super_admin
      if (!['admin', 'super_admin'].includes(adminProfile.role)) {
        await supabase.auth.signOut();
        throw new Error('Access denied. Insufficient privileges.');
      }

      // Update admin security settings
      await supabase
        .from('admin_security_settings')
        .upsert({
          user_id: authData.user.id,
          last_login: new Date().toISOString(),
          login_attempts: 0
        });

      toast.success('Admin login successful!');
      
      // Navigate to admin dashboard
      navigate('/admin');
      
    } catch (error: unknown) {
      console.error('Admin login error:', error);
      
      const errorMessage = (error as Error).message;
      
      if (errorMessage.includes('Invalid login credentials')) {
        setError('Invalid email or password');
      } else if (errorMessage.includes('Access denied')) {
        setError(errorMessage);
      } else if (errorMessage.includes('Email not confirmed')) {
        setError('Please confirm your email address before signing in');
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
    accountLocked,
    handleSubmit
  };
}