
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UserCredits {
  id: string;
  user_id: string;
  service_type: string;
  credits: number;
  credits_remaining: number; // For backward compatibility
  credits_purchased: number; // For backward compatibility
  created_at: string;
  updated_at: string;
}

export const useUserCredits = () => {
  const queryClient = useQueryClient();

  const { data: credits, isLoading, error } = useQuery({
    queryKey: ['user-credits'],
    queryFn: async (): Promise<UserCredits | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', user.id)
        .eq('service_type', 'sms')
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        return data;
      }
      
      // If no credits record exists, create one with zero balance
      const { data: newRecord, error: insertError } = await supabase
        .from('user_credits')
        .insert({
          user_id: user.id,
          service_type: 'sms',
          credits: 0,
          credits_remaining: 0,
          credits_purchased: 0
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      return newRecord;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const purchaseCredits = useMutation({
    mutationFn: async (amount: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('user_credits')
        .update({
          credits: (credits?.credits || 0) + amount,
          credits_remaining: (credits?.credits_remaining || 0) + amount,
          credits_purchased: (credits?.credits_purchased || 0) + amount,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('service_type', 'sms')
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-credits'] });
      toast.success('Credits purchased successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to purchase credits: ${error.message}`);
    }
  });

  const refetch = async () => {
    return queryClient.refetchQueries({ queryKey: ['user-credits'] });
  };

  return {
    credits,
    data: credits, // For backward compatibility
    isLoading,
    error,
    purchaseCredits,
    refetch
  };
};
