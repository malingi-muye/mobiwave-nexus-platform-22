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
    return !!clientSession || user?.user_metadata?.user_type === 'client';
  };

  // Determine if admin by checking user_type or role
  const isAdminSession = () => {
    return user?.user_metadata?.role === 'admin' || user?.user_metadata?.role === 'super_admin';
  };

  // Use different queryKey for admin/client
  const queryKey = isAdminSession()
    ? ['admin-profile', user?.id]
    : ['client-profile', user?.id];

  const { data: profile, isLoading, error } = useQuery({
    queryKey,
    queryFn: async (): Promise<any | null> => {
      if (!user?.id) return null;

      if (isAdminSession()) {
        // Fetch from profiles/public_profiles for admin
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (error) throw error;
        return data;
      } else {
        // Fetch from client_profiles for client
        const username = user?.user_metadata?.username;
        if (!username) return null;
        const { data, error } = await supabase
          .from('client_profiles')
          .select('*')
          .eq('username', username)
          .maybeSingle();
        if (error) throw error;
        return data;
      }
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const getDisplayName = () => {
    if (isAdminSession()) {
      if (profile?.first_name) return profile.first_name;
      if (profile?.full_name) return profile.full_name;
      if (user?.user_metadata?.first_name) return user.user_metadata.first_name;
      if (user?.email) return user.email.split('@')[0];
      return 'Admin';
    } else {
      if (profile?.username) return profile.username;
      if (profile?.client_name) return profile.client_name;
      if (user?.user_metadata?.username) return user.user_metadata.username;
      if (user?.user_metadata?.client_name) return user.user_metadata.client_name;
      if (user?.email) return user.email.split('@')[0];
      return 'User';
    }
  };

  return {
    profile,
    isLoading,
    error,
    getDisplayName,
    isClientUser: isClientSession(),
    isAdminUser: isAdminSession(),
  };
};