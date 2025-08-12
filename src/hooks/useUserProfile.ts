import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { mspaceApi } from '@/services/mspaceApi';

export interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  full_name: string | null;
  role: string | null;
  user_type: string | null;
  username?: string;
}

export interface ClientProfile {
  id: string;
  user_id: string;
  client_name: string;
  username: string;
  email?: string;
  phone?: string;
  sms_balance: number;
  api_key?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  metadata: Record<string, unknown>;
}

export const useUserProfile = () => {
  const { user } = useAuth();

  const isClientSession = () => {
    const clientSession = localStorage.getItem('client_session');
    return !!clientSession;
  };

  const queryKey = ['client-profile', user?.id];

  const { data: profile, isLoading, error } = useQuery({
    queryKey,
    queryFn: async (): Promise<ClientProfile | null> => {
      if (!user?.id) return null;

      // Check if this is a client profile user
      if (user?.user_metadata?.user_type === 'client') {
        // For client profiles, use the data from the session
        return {
          id: user.id,
          user_id: user.id,
          client_name: user.user_metadata.client_name || '',
          username: user.user_metadata.username || '',
          email: user.email || '',
          phone: '',
          sms_balance: user.user_metadata.sms_balance || 0,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {}
        };
      }

      // For regular users, fetch from database
      const username = user?.user_metadata?.username;
      if (!username) return null;

      // Fetch profile and API key in parallel
      const [profileResponse, apiKeyResponse] = await Promise.all([
        supabase.from('client_profiles').select('*').eq('username', username).maybeSingle(),
        supabase.from('api_credentials').select('api_key_encrypted').eq('username', username).maybeSingle()
      ]);

      if (profileResponse.error) throw profileResponse.error;
      if (apiKeyResponse.error) throw apiKeyResponse.error;

      const clientProfile = profileResponse.data;
      const apiKey = apiKeyResponse.data?.api_key_encrypted;

      if (!clientProfile) return null;

      return {
        ...clientProfile,
        api_key: apiKey,
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const getDisplayName = () => {
    if (isClientSession() && user?.user_metadata?.client_name) {
      return user.user_metadata.client_name;
    }
    if (profile?.client_name) {
      return profile.client_name;
    }
    if (profile?.username) {
      return profile.username;
    }
    if (profile?.email) {
      return profile.email.split('@')[0];
    }
    return 'User';
  };

  return {
    profile,
    isLoading,
    error,
    getDisplayName,
    isClientUser: isClientSession(),
  };
};