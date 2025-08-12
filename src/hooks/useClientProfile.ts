import { useAuth } from '@/components/auth/AuthProvider';

export interface ClientProfileData {
  username: string;
  sms_balance: number;
  client_name: string;
  email: string;
  user_id: string;
  user_type: string;
  phone?: string;
  is_active?: boolean;
}

export const useClientProfile = () => {
  const { user } = useAuth();

  const isClientProfile = user?.user_metadata?.user_type === 'client';

  const clientProfile: ClientProfileData | null = isClientProfile ? {
    username: user.user_metadata?.username || '',
    sms_balance: user.user_metadata?.sms_balance || 0,
    client_name: user.user_metadata?.client_name || '',
    email: user.email || '',
    user_id: user.id,
    user_type: user.user_metadata?.user_type || 'client',
    phone: user.user_metadata?.phone || '',
    is_active: user.user_metadata?.is_active ?? true
  } : null;

  return {
    isClientProfile,
    clientProfile,
    username: clientProfile?.username || '',
    smsBalance: clientProfile?.sms_balance || 0,
    clientName: clientProfile?.client_name || '',
    phone: clientProfile?.phone || '',
    isActive: clientProfile?.is_active ?? true,
  };
};