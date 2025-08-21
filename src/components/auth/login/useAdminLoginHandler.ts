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

      // First, check if user has admin profile
      const { data: adminProfile, error: adminError } = await supabase
        .from('admin_profiles')
        .select('role, user_id')
        .eq('user_id', authData.user.id)
        .single();

      // If admin profile exists and has admin privileges
      if (!adminError && adminProfile && ['admin', 'super_admin'].includes(adminProfile.role)) {
        // Update admin security settings
        await supabase
          .from('admin_security_settings')
          .upsert({
            user_id: authData.user.id,
            last_login: new Date().toISOString(),
            login_attempts: 0
          });

        toast.success('Admin login successful!');
        navigate('/admin');
        return;
      }

      // If not admin, check if user is a demo user in profiles table
      const { data: demoProfile, error: demoError } = await supabase
        .from('profiles')
        .select('id, role, full_name, email')
        .eq('id', authData.user.id)
        .single();

      if (!demoError && demoProfile) {
        // User is a demo user - redirect to client dashboard
        toast.success('Demo user login successful!');
        navigate('/dashboard');
        return;
      }

      // If user exists in auth but has no profile, deny access
      await supabase.auth.signOut();
      throw new Error('Access denied. No valid profile found.');
      
    } catch (error: unknown) {
      console.error('Admin login error:', error);
      
      const errorMessage = (error as Error).message;
      
      if (errorMessage.includes('Invalid login credentials')) {
        setError('Invalid email or password');
      } else if (errorMessage.includes('Access denied')) {
        setError(errorMessage);
      } else if (errorMessage.includes('Email not confirmed')) {
        setError('Please confirm your email address before signing in');
      } else if (errorMessage.includes('No valid profile found')) {
        setError('Account not found or not authorized for this system');
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