import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/AuthProvider';

interface ApiCredential {
  id: string;
  user_id: string;
  username: string;
  service_name: string;
  api_key_encrypted?: string;
  additional_config?: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  last_used_at?: string;
  permissions?: string[];
  rate_limit?: number;
}

export const useSecureApiCredentials = () => {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();

  const { data: credentials = [], isLoading, error } = useQuery({
    queryKey: ['api-credentials'],
    queryFn: async (): Promise<ApiCredential[]> => {
      // Check if this is a client profile user
      if (authUser?.user_metadata?.user_type === 'client') {
        // For client profiles, return a mock credential with the username from the profile
        return [{
          id: 'client-profile',
          user_id: authUser.id,
          username: authUser.user_metadata.username || '',
          service_name: 'mspace',
          api_key_encrypted: '', // Client profiles don't have API keys
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }];
      }

      // Get current user to determine which tables to query
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

      if (isAdmin) {
        // Admin users see their admin keys
        const { data, error } = await supabase
          .from('admin_api_keys')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map((row: any) => ({
          ...row,
          username: row.key_name ?? '',
          api_key_encrypted: row.api_key_hash,
          service_name: 'mspace',
          is_active: row.status === 'active'
        }));
      } else {
        // Regular users see their api credentials
        const { data, error } = await supabase
          .from('api_credentials')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map((row: any) => ({
          ...row,
          username: row.username ?? ''
        }));
      }
    }
  });

  // Save credential directly to database
  const saveCredential = useMutation({
    mutationFn: async ({ service_name, api_key, user_id, username }: { service_name: string; api_key: string; user_id: string; username: string }) => {
      // Check if user is admin to determine which table to use
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user_id)
        .single();

      const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

      if (isAdmin) {
        // Save to admin_api_keys table
        const { data, error } = await supabase
          .from('admin_api_keys')
          .insert({
            user_id,
            key_name: username,
            api_key_hash: api_key, // Store directly for now
            api_key_preview: api_key.substring(0, 8) + '...',
            status: 'active',
            permissions: ['read', 'write']
          })
          .select()
          .single();

        if (error) {
          throw new Error(error.message || 'Failed to save admin credentials');
        }
        return data;
      } else {
        // Save to api_credentials table
        const { data, error } = await supabase
          .from('api_credentials')
          .insert({
            service_name,
            api_key_encrypted: api_key,
            user_id,
            username,
            is_active: true
          })
          .select()
          .single();

        if (error) {
          throw new Error(error.message || 'Failed to save credentials');
        }
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-credentials'] });
      toast.success('API credentials saved successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to save credentials: ${error.message}`);
    }
  });

  const updateCredential = useMutation({
    mutationFn: async ({ id, api_key }: { id: string; api_key: string }) => {
      // First try to find in admin_api_keys table
      const { data: adminKey } = await supabase
        .from('admin_api_keys')
        .select('id')
        .eq('id', id)
        .single();

      if (adminKey) {
        // Update admin key
        const { data, error } = await supabase
          .from('admin_api_keys')
          .update({ 
            api_key_hash: api_key,
            api_key_preview: api_key.substring(0, 8) + '...'
          })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          throw new Error(error.message || 'Failed to update admin credentials');
        }
        return data;
      } else {
        // Update regular credential
        const { data, error } = await supabase
          .from('api_credentials')
          .update({ api_key_encrypted: api_key })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          throw new Error(error.message || 'Failed to update credentials');
        }
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-credentials'] });
      toast.success('API credential updated');
    },
    onError: (error: any) => {
      toast.error(`Failed to update credential: ${error.message}`);
    }
  });

  const deleteCredential = useMutation({
    mutationFn: async (id: string) => {
      // First try to delete from admin_api_keys table
      const { data: adminKey } = await supabase
        .from('admin_api_keys')
        .select('id')
        .eq('id', id)
        .single();

      if (adminKey) {
        const { error } = await supabase
          .from('admin_api_keys')
          .delete()
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('api_credentials')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-credentials'] });
      toast.success('API credential deleted');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete credential: ${error.message}`);
    }
  });

  const getDecryptedCredential = async (serviceName: string): Promise<string | null> => {
    // For security, don't return decrypted credentials to client
    return null;
  };

  // Generate API key functionality (previously in useApiKeys)
  const generateApiKey = useMutation({
    mutationFn: async ({
      keyName,
      serviceName = 'mspace',
      permissions = [],
      rateLimit = 1000,
      expiresAt
    }: {
      keyName: string;
      serviceName?: string;
      permissions?: string[];
      rateLimit?: number;
      expiresAt?: string;
    }) => {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      // Check if user is admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.data.user.id)
        .single();

      const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

      // Generate a random API key
      const apiKey = `${serviceName}_${keyName.includes('live') ? 'live' : 'test'}_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;

      if (isAdmin) {
        // Generate admin API key
        const { data, error } = await supabase
          .from('admin_api_keys')
          .insert({
            user_id: user.data.user.id,
            key_name: keyName,
            api_key_hash: apiKey,
            api_key_preview: apiKey.substring(0, 8) + '...',
            status: 'active',
            permissions: permissions.length > 0 ? permissions : ['read', 'write'],
            expires_at: expiresAt
          })
          .select()
          .single();

        if (error) {
          throw new Error(error.message || 'Failed to generate admin API key');
        }

        return {
          ...data,
          api_key: apiKey // Return the unencrypted key for one-time display
        };
      } else {
        // Generate regular API key
        const { data, error } = await supabase
          .from('api_credentials')
          .insert({
            service_name: serviceName,
            api_key_encrypted: apiKey,
            user_id: user.data.user.id,
            username: keyName,
            is_active: true,
            expires_at: expiresAt
          })
          .select()
          .single();

        if (error) {
          throw new Error(error.message || 'Failed to generate API key');
        }

        return {
          ...data,
          api_key: apiKey // Return the unencrypted key for one-time display
        };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-credentials'] });
      toast.success('API key created successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to create API key: ${error.message}`);
    }
  });

  // Toggle API key functionality (previously in useApiKeys)
  const toggleApiKey = useMutation({
    mutationFn: async ({ keyId, isActive }: { keyId: string; isActive: boolean }) => {
      // First try to find in admin_api_keys table
      const { data: adminKey } = await supabase
        .from('admin_api_keys')
        .select('id')
        .eq('id', keyId)
        .single();

      if (adminKey) {
        const { error } = await supabase
          .from('admin_api_keys')
          .update({ status: isActive ? 'active' : 'inactive' })
          .eq('id', keyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('api_credentials')
          .update({ is_active: isActive })
          .eq('id', keyId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-credentials'] });
      toast.success('API key updated successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to update API key: ${error.message}`);
    }
  });

  // Get API usage functionality (mock implementation since api_usage table doesn't exist)
  const getApiUsage = async (keyId: string) => {
    try {
      // Return empty array since api_usage table doesn't exist in current schema
      return [];
    } catch (error) {
      console.error('Error fetching API usage:', error);
      return [];
    }
  };

  return {
    // Original functionality
    credentials,
    isLoading,
    error,
    saveCredential: saveCredential.mutateAsync,
    updateCredential: updateCredential.mutateAsync,
    deleteCredential: deleteCredential.mutateAsync,
    getDecryptedCredential,
    isSaving: saveCredential.isPending,
    isUpdating: updateCredential.isPending,
    isDeleting: deleteCredential.isPending,
    
    // Added functionality from useApiKeys
    generateApiKey: generateApiKey.mutateAsync,
    toggleApiKey: toggleApiKey.mutateAsync,
    getApiUsage,
    isGenerating: generateApiKey.isPending,
    isToggling: toggleApiKey.isPending
  };
};
