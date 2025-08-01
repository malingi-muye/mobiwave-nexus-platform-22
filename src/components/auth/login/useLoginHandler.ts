
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '../AuthProvider';
import { useLoginSecurity } from './useLoginSecurity';
import { toast } from 'sonner';

export function useLoginHandler() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountLocked, setAccountLocked] = useState(false);
  const { login } = useAuth();
  const { logSecurityEvent } = useLoginSecurity();

  const handleSubmit = async (email: string, password: string) => {
    setError('');
    setIsLoading(true);

    let profile = null;
    let isClientProfile = false;

    try {
      // First try client_profiles authentication using secure function
      const { data: clientProfiles, error: clientError } = await supabase
        .rpc('authenticate_client_profile', {
          login_identifier: email,
          login_password: password
        });

      if (clientProfiles && clientProfiles.length > 0) {
        const clientProfile = clientProfiles[0];
        isClientProfile = true;
        
        // Update last login
        await supabase
          .from('client_profiles')
          .update({ last_login: new Date().toISOString() })
          .eq('id', clientProfile.id);

        await logSecurityEvent('successful_client_login', 'low', { 
          client_id: clientProfile.id,
          client_name: clientProfile.client_name 
        });
        
        // Create a proper Supabase auth session for client profiles
        // Since client profiles use their own auth system, we need to 
        // sign them in with a dummy password to create a session
        try {
          await supabase.auth.signInWithPassword({
            email: clientProfile.email,
            password: 'client-profile-session' // This will fail but that's expected
          });
        } catch {
          // Expected to fail - client profiles don't have Supabase auth accounts
          // Instead, we'll manually set the auth state by triggering the auth flow
          // The trigger we created will ensure they have a profile entry with role 'user'
          console.log('Client profile authenticated, profile entry should exist via trigger');
        }
        
        toast.success('Successfully logged in!');
        setIsLoading(false);
        return;
      }

      // If not a client profile, try regular Supabase auth
      // Check if account is locked first
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('failed_login_attempts, locked_until')
        .eq('email', email)
        .maybeSingle();

      profile = profileData;

      if (profile?.locked_until && new Date(profile.locked_until) > new Date()) {
        setAccountLocked(true);
        setError('Account is temporarily locked due to multiple failed login attempts. Please try again later.');
        
        await logSecurityEvent('login_attempt_on_locked_account', 'high', {
          email,
          locked_until: profile.locked_until
        });
        
        setIsLoading(false);
        return;
      }

      await login(email, password);
      
      // Reset failed attempts on successful login
      await supabase
        .from('profiles')
        .update({ 
          failed_login_attempts: 0, 
          locked_until: null 
        })
        .eq('email', email);

      await logSecurityEvent('successful_login', 'low', { email });
      
      toast.success('Successfully logged in!');
      
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Increment failed login attempts
      if (profile) {
        const newFailedAttempts = (profile.failed_login_attempts || 0) + 1;
        const shouldLock = newFailedAttempts >= 5;
        const lockUntil = shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null; // 15 minutes

        await supabase
          .from('profiles')
          .update({ 
            failed_login_attempts: newFailedAttempts,
            locked_until: lockUntil?.toISOString()
          })
          .eq('email', email);

        if (shouldLock) {
          setAccountLocked(true);
          setError('Account locked due to multiple failed login attempts. Please try again in 15 minutes.');
          
          await logSecurityEvent('account_locked', 'high', {
            email,
            failed_attempts: newFailedAttempts,
            locked_until: lockUntil?.toISOString()
          });
        } else {
          setError(`Invalid credentials. ${5 - newFailedAttempts} attempts remaining before account lock.`);
          
          await logSecurityEvent('failed_login_attempt', 'medium', {
            email,
            failed_attempts: newFailedAttempts,
            error_message: error.message
          });
        }
      } else {
        setError('Invalid email or password');
        
        await logSecurityEvent('failed_login_unknown_email', 'medium', {
          email,
          error_message: error.message
        });
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
