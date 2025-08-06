import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';

interface SmsBalanceResponse {
  balance: number;
  username: string;
  updated_at: string;
}

export const useSmsBalance = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: balanceData, isLoading, error, refetch } = useQuery({
    queryKey: ['sms-balance', user?.id],
    queryFn: async (): Promise<SmsBalanceResponse | null> => {
      if (!user?.id) return null;

      try {
        const { data, error } = await supabase.functions.invoke('mspace-sms-balance');

        if (error) {
          console.error('SMS balance fetch error:', error);
          throw new Error(error.message || 'Failed to fetch SMS balance');
        }

        return data;
      } catch (err) {
        console.error('SMS balance query error:', err);
        throw err;
      }
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
    retryDelay: 1000,
  });

  const refreshBalance = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase.functions.invoke('mspace-sms-balance');

      if (error) {
        throw new Error(error.message || 'Failed to refresh SMS balance');
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['sms-balance', user?.id], data);
      toast.success('SMS balance updated successfully');
    },
    onError: (error) => {
      console.error('Failed to refresh SMS balance:', error);
      toast.error('Failed to refresh SMS balance');
    }
  });

  return {
    balance: balanceData?.balance || 0,
    username: balanceData?.username,
    lastUpdated: balanceData?.updated_at,
    isLoading,
    error,
    refetch,
    refreshBalance: refreshBalance.mutate,
    isRefreshing: refreshBalance.isPending,
  };
};