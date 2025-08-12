import { useQuery } from '@tanstack/react-query';
import { mspaceApi } from '@/services/mspaceApi';
import { useSecureApiCredentials } from './useSecureApiCredentials';
import { useAuth } from '@/components/auth/AuthProvider';

export const useSmsBalance = () => {
  const { credentials, isLoading: credentialsLoading } = useSecureApiCredentials();
  const { user } = useAuth();

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['sms-balance', credentials, user?.user_metadata?.user_type],
    queryFn: async () => {
      console.log('useSmsBalance: queryFn started');
      
      // Check if this is a client profile user
      if (user?.user_metadata?.user_type === 'client') {
        console.log('useSmsBalance: Client profile detected, using stored balance');
        const clientBalance = user.user_metadata.sms_balance || 0;
        console.log('useSmsBalance: Client balance from profile:', clientBalance);
        return clientBalance;
      }

      // For regular users, use the existing API-based approach
      if (!credentials || credentials.length === 0) {
        console.log('useSmsBalance: No credentials found');
        return 0;
      }

      // Assuming the first credential is the one to use
      const credential = credentials[0];
      const apiKey = credential.api_key_encrypted;
      const username = credential.username;

      console.log('useSmsBalance: Using credentials:', { apiKey, username });

      if (!apiKey || !username) {
        console.log('useSmsBalance: Missing apiKey or username');
        return 0;
      }

      const response = await mspaceApi.queryBalanceV2(apiKey, username);
      console.log('SMS Balance API Response:', response);
      return response.balance;
    },
    enabled: (user?.user_metadata?.user_type === 'client') || (!credentialsLoading && credentials && credentials.length > 0),
  });

  return {
    balance: balance || 0,
    isLoading: credentialsLoading || balanceLoading,
  };
};