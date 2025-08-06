import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useSmsBalance } from './useSmsBalance';

export interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  full_name: string | null;
  role: string | null;
  user_type: string | null;
}

export interface ClientProfile {
  id: string;
  user_id: string;
  client_name: string;
  username: string;
  email?: string;
  phone?: string;
  sms_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  metadata: any;
}

export const useUserProfile = () => {
  const { user } = useAuth();

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async (): Promise<UserProfile | null> => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: clientProfile, isLoading: clientLoading, error: clientError } = useQuery({
    queryKey: ['client-profile', user?.id],
    queryFn: async (): Promise<ClientProfile | null> => {
      if (!user?.id || profile?.user_type !== 'client') return null;

      const { data, error } = await supabase
        .from('client_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && profile?.user_type === 'client',
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const isLoading = profileLoading || clientLoading;
  const error = profileError || clientError;
  const { balance: realTimeSmsBalance } = useSmsBalance();

  const getDisplayName = () => {
    console.log('Profile data:', { profile, clientProfile, userType: profile?.user_type });
    
    // For client users, use client_name
    if (profile?.user_type === 'client' && clientProfile?.client_name) {
      return clientProfile.client_name;
    }
    
    // For regular demo users
    if (profile?.first_name) {
      return profile.first_name;
    }
    if (profile?.full_name) {
      return profile.full_name.split(' ')[0];
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'User';
  };

  const getSmsBalance = () => {
    console.log('SMS Balance check:', { 
      profile, 
      clientProfile, 
      dbBalance: clientProfile?.sms_balance,
      realTimeBalance: realTimeSmsBalance 
    });
    
    // Use real-time balance from M-Space API if available, fallback to DB balance
    if (profile?.user_type === 'client') {
      return realTimeSmsBalance || clientProfile?.sms_balance || 0;
    }
    return 0;
  };

  return {
    profile,
    clientProfile,
    isLoading,
    error,
    getDisplayName,
    getSmsBalance,
    isClientUser: profile?.user_type === 'client',
    isDemoUser: profile?.user_type === 'demo',
  };
};