import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Mock user type for client profiles
interface MockUser {
  id: string;
  aud: string;
  created_at: string;
  updated_at: string | null;
  email?: string;
  phone?: string;
  confirmed_at?: string;
  email_confirmed_at?: string;
  phone_confirmed_at?: string;
  last_sign_in_at?: string;
  role?: string;
  app_metadata: Record<string, any>;
  user_metadata: {
    client_name?: string;
    username?: string;
    sms_balance?: number;
    role?: string;
    user_type?: string;
    phone?: string;
    is_active?: boolean;
    api_key_encrypted?: string | null;
  };
}

export function useAuthState() {
  const [user, setUser] = useState<User | MockUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  const fetchUserRole = async (userId: string) => {
    try {
      console.log('Fetching user role for:', userId);

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Role fetch timeout')), 5000)
      );

      // First check admin_profiles table
      const adminRolePromise = supabase
        .from('admin_profiles')
        .select('role')
        .eq('user_id', userId)
        .single();

      const { data: adminProfile, error: adminError } = await Promise.race([
        adminRolePromise,
        timeoutPromise
      ]) as { data: { role: string } | null; error: Error | null };

      if (!adminError && adminProfile && adminProfile.role) {
        console.log('Role from admin_profiles table:', adminProfile.role);
        return adminProfile.role;
      }

      // If not found in admin_profiles, check regular profiles table
      const rolePromise = supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      const { data: profile, error: profileError } = await Promise.race([
        rolePromise,
        timeoutPromise
      ]) as { data: { role: string } | null; error: Error | null };

      if (profileError) {
        console.error('Profile fetch error:', profileError);

        // Don't retry if it's a network issue
        if (profileError.message?.includes('Failed to fetch') || profileError.message?.includes('timeout')) {
          console.warn('Network issue fetching role, defaulting to user');
          return 'user';
        }

        // Only retry for other types of errors
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const { data: retryProfile, error: retryError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();

          if (!retryError && retryProfile) {
            console.log('Role found on retry:', retryProfile.role);
            return retryProfile.role || 'user';
          }
        } catch (retryError) {
          console.error('Retry also failed:', retryError);
        }

        console.log('No profile found after retry, defaulting to user');
        return 'user';
      }

      if (profile && profile.role) {
        console.log('Role from profiles table:', profile.role);
        return profile.role;
      }

      console.log('No role found in profile, defaulting to user');
      return 'user';
    } catch (error: unknown) {
      console.error('Role fetch failed:', error);

      // Handle network connectivity issues gracefully
      if ((error as Error).message?.includes('Failed to fetch') || (error as Error).message?.includes('timeout')) {
        console.warn('Network connectivity issue fetching role. Defaulting to user');
      }

      return 'user';
    }
  };

  useEffect(() => {
    console.log('Setting up auth state listener...');
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        
        // Check if we have a client session first - don't override it
        const clientSession = localStorage.getItem('client_session');
        if (clientSession && !session) {
          console.log('Preserving client session, ignoring auth state change');
          setIsLoading(false);
          return;
        }
        
        if (event === 'SIGNED_OUT' || !session) {
          // Only clear state if we don't have a client session
          if (!clientSession) {
            setSession(null);
            setUser(null);
            setUserRole(null);
          }
          setIsLoading(false);
          return;
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(async () => {
            const role = await fetchUserRole(session.user.id);
            setUserRole(role);
            console.log('User role set to:', role);
          }, 100);
        } else {
          setUserRole(null);
        }
        
        setIsLoading(false);
      }
    );

    const getSession = async () => {
      try {
        console.log('Checking for existing session...');

        // First check for client profile session in localStorage
        const clientSession = localStorage.getItem('client_session');
        if (clientSession) {
          try {
            const sessionData = JSON.parse(clientSession);
            // Reject expired or unsigned sessions early
            if (!sessionData?.token || !sessionData?.expires_at || Date.now() / 1000 > Number(sessionData.expires_at)) {
              localStorage.removeItem('client_session');
              throw new Error('Invalid or expired client session');
            }
            console.log('Found client profile session:', sessionData);
            
            // Fetch complete client profile data using the new service
            try {
              // Import the service dynamically to avoid circular dependencies
              const { ClientProfileService } = await import('@/utils/clientProfileService');
              
              const profileResult = await ClientProfileService.fetchCompleteClientProfile(
                sessionData.client_name,
                sessionData.email
              );

              if (!profileResult.success) {
                console.error('Failed to fetch client profile:', 'error' in profileResult ? profileResult.error : 'Unknown error');
                
                // Fall back to session data only
                const mockUser: MockUser = {
                  id: sessionData.user_id,
                  email: sessionData.email,
                  aud: 'authenticated',
                  created_at: new Date().toISOString(),
                  updated_at: null,
                  app_metadata: {},
                  user_metadata: {
                    client_name: sessionData.client_name,
                    username: sessionData.username || '',
                    sms_balance: sessionData.sms_balance || 0,
                    role: sessionData.role,
                    user_type: sessionData.user_type,
                    phone: sessionData.phone || '',
                    is_active: sessionData.is_active || true,
                    api_key_encrypted: sessionData.api_key_encrypted || null
                  }
                };
                
                setUser(mockUser);
                setUserRole(sessionData.role);
                setIsLoading(false);
                return;
              }

              const clientProfile = profileResult.data;

              // Create a mock user object for client profiles with complete data including API key
              const mockUser: MockUser = {
                id: sessionData.user_id,
                email: sessionData.email,
                aud: 'authenticated',
                created_at: new Date().toISOString(),
                updated_at: null,
                app_metadata: {},
                user_metadata: {
                  client_name: clientProfile?.client_name || sessionData.client_name,
                  username: clientProfile?.username || sessionData.username || '',
                  sms_balance: clientProfile?.sms_balance || sessionData.sms_balance || 0,
                  role: sessionData.role,
                  user_type: sessionData.user_type,
                  phone: clientProfile?.phone || '',
                  is_active: clientProfile?.is_active || true,
                  api_key_encrypted: clientProfile?.api_key_encrypted ?? null
                }
              };

              // Update localStorage with complete profile data including API key
              const updatedSessionData = {
                ...sessionData,
                username: clientProfile?.username || '',
                sms_balance: clientProfile?.sms_balance || 0,
                phone: clientProfile?.phone || '',
                is_active: clientProfile?.is_active || true,
                api_key_encrypted: clientProfile?.api_key_encrypted ?? null
              };
              localStorage.setItem('client_session', JSON.stringify(updatedSessionData));
              
              setUser(mockUser);
              setUserRole(sessionData.role);
              setIsLoading(false);
              return;
            } catch (profileError) {
              console.error('Failed to fetch client profile data:', profileError);
              
              // Try to fetch API credentials using the username from session data if available
              let apiKey = null;
              if (sessionData.username) {
                console.log('Attempting to fetch API credentials for session username:', sessionData.username);
                try {
                  const { data: apiCredentials, error: apiError } = await supabase
                    .from('api_credentials')
                    .select('api_key_encrypted')
                    .eq('username', sessionData.username)
                    .eq('service_name', 'mspace')
                    .single();
                  
                  if (apiError) {
                    console.error('Error fetching API credentials from session username:', apiError);
                  } else {
                    apiKey = apiCredentials?.api_key_encrypted;
                    console.log('API key found for session username:', sessionData.username);
                  }
                } catch (apiError) {
                  console.error('Failed to fetch API credentials from session username:', apiError);
                }
              }
              
              // Fallback to session data without complete profile but with API key if found
              const mockUser: MockUser = {
                id: sessionData.user_id,
                email: sessionData.email,
                aud: 'authenticated',
                created_at: new Date().toISOString(),
                updated_at: null,
                app_metadata: {},
                user_metadata: {
                  client_name: sessionData.client_name,
                  username: sessionData.username || '',
                  sms_balance: sessionData.sms_balance || 0,
                  role: sessionData.role,
                  user_type: sessionData.user_type,
                  api_key_encrypted: apiKey
                }
              };
              
              // Update localStorage with API key if found
              if (apiKey) {
                const updatedSessionData = {
                  ...sessionData,
                  api_key_encrypted: apiKey
                };
                localStorage.setItem('client_session', JSON.stringify(updatedSessionData));
              }
              
              setUser(mockUser);
              setUserRole(sessionData.role);
              setIsLoading(false);
              return;
            }
          } catch (parseError) {
            console.error('Failed to parse client session:', parseError);
            localStorage.removeItem('client_session');
          }
        }

        // Add timeout to prevent hanging on network issues
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session check timeout')), 10000)
        );

        const sessionPromise = supabase.auth.getSession();

        const { data: { session }, error } = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]) as { data: { session: Session | null }; error: Error | null };

        if (error) {
          console.error('Error getting session:', error);

          // If it's a network error, set user as unauthenticated but don't crash
          if (error.message?.includes('Failed to fetch') || error.message?.includes('timeout')) {
            console.warn('Network issue detected, continuing without session');
            setSession(null);
            setUser(null);
            setUserRole(null);
            setIsLoading(false);
            return;
          }

          setIsLoading(false);
          return;
        }

        if (session?.user) {
          console.log('Existing session found:', !!session);
          setSession(session);
          setUser(session.user);

          try {
            const role = await fetchUserRole(session.user.id);
            setUserRole(role);
            console.log('Existing user role:', role);
          } catch (roleError) {
            console.error('Failed to fetch user role:', roleError);
            setUserRole('user'); // Default role
          }
        }
      } catch (error: unknown) {
        console.error('Session check failed:', error);

        // Handle network/connectivity issues gracefully
        if ((error as Error).message?.includes('Failed to fetch') || (error as Error).message?.includes('timeout')) {
          console.warn('Network connectivity issue detected. App will continue without authentication.');
          setSession(null);
          setUser(null);
          setUserRole(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    getSession();

    return () => {
      console.log('Cleaning up auth subscription');
      subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    session,
    isLoading,
    userRole,
    setUser,
    setSession,
    setUserRole,
    setIsLoading
  };
}
