import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClientProfile {
  id: string;
  user_id: string;
  client_name: string;
  username: string;
  email: string | null;
  created_at: string;
  is_active: boolean;
}

interface ApiCredential {
  id: string;
  user_id: string;
  username: string;
  service_name: string;
  api_key_encrypted: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const ApiCredentialsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [serviceName, setServiceName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editApiKey, setEditApiKey] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  // Get all users directly from auth for admin assignment
  const { data: authUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-users');
      if (error) throw error;
      return data?.users || [];
    }
  });

  // Get profiles to enrich user data
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, full_name, role, user_type');
      if (error) throw error;
      return data || [];
    }
  });

  // Combine auth users with profile data
  const allUsers = authUsers.map(authUser => {
    const profile = profiles.find(p => p.id === authUser.id);
    return {
      id: authUser.id,
      email: authUser.email,
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      full_name: profile?.full_name || '',
      role: profile?.role || 'user',
      user_type: profile?.user_type || 'demo',
      ...authUser
    };
  });

  // Fetch client profiles
  const { data: clientProfiles = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['client-profiles'],
    queryFn: async (): Promise<ClientProfile[]> => {
      const { data, error } = await supabase
        .from('client_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    }
  });

  // Combine regular users and client profiles for selection
  const allUsersAndClients = [
    ...allUsers.map(user => ({
      ...user,
      type: 'user' as const,
      display_name: user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : user.email,
      identifier: user.email
    })),
    ...clientProfiles.map(client => ({
      id: client.user_id,
      email: client.email || '',
      first_name: client.client_name,
      last_name: '',
      user_type: 'client',
      type: 'client' as const,
      display_name: client.client_name,
      identifier: client.username,
      client_profile_id: client.id
    }))
  ];

  // Fetch credentials directly from database
  const { data: credentials = [], isLoading, error } = useQuery({
    queryKey: ['api-credentials'],
    queryFn: async (): Promise<ApiCredential[]> => {
      const { data, error } = await supabase
        .from('api_credentials')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    }
  });

  // Save credential mutation
  const saveCredentialMutation = useMutation({
    mutationFn: async ({ service_name, api_key, user_id, username }: { service_name: string; api_key: string; user_id: string; username: string }) => {
      // First check if credential already exists
      const { data: existing, error: checkError } = await supabase
        .from('api_credentials')
        .select('id')
        .eq('user_id', user_id)
        .eq('service_name', service_name)
        .maybeSingle();

      if (checkError) {
        throw checkError;
      }

      if (existing) {
        // Update existing credential
        const { data, error } = await supabase
          .from('api_credentials')
          .update({
            api_key_encrypted: api_key,
            username,
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          throw error;
        }
        return data;
      } else {
        // Insert new credential
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
          throw error;
        }
        return data;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-credentials'] });
      toast.success('API credentials saved successfully');
    },
    onError: (error: unknown) => {
      toast.error(`Failed to save credentials: ${(error as Error).message}`);
    }
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName || !apiKey || !selectedUserId || !username) return;
    
    // Parse the selectedUserId to get the actual user_id
    let actualUserId = selectedUserId;
    if (selectedUserId.startsWith('client-')) {
      const clientId = selectedUserId.replace('client-', '');
      const selectedClient = clientProfiles.find(c => c.id === clientId);
      if (selectedClient) {
        actualUserId = selectedClient.user_id;
      }
    }
    
    await saveCredentialMutation.mutateAsync({ 
      service_name: serviceName, 
      api_key: apiKey, 
      user_id: actualUserId, 
      username 
    });
    setServiceName('');
    setApiKey('');
    setUsername('');
    setSelectedUserId('');
  };

  const handleEdit = (id: string) => {
    setEditId(id);
    setEditApiKey(''); // Don't pre-populate for security
  };

  // Update credential mutation
  const updateCredentialMutation = useMutation({
    mutationFn: async ({ id, api_key }: { id: string; api_key: string }) => {
      const { data, error } = await supabase
        .from('api_credentials')
        .update({ api_key_encrypted: api_key }) // Store directly
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-credentials'] });
      toast.success('API credential updated');
    },
    onError: (error: unknown) => {
      toast.error(`Failed to update credential: ${(error as Error).message}`);
    }
  });

  const handleUpdate = async (id: string) => {
    if (!editApiKey) return;
    await updateCredentialMutation.mutateAsync({ id, api_key: editApiKey });
    setEditId(null);
    setEditApiKey('');
  };

  // Delete credential mutation
  const deleteCredentialMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('api_credentials')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-credentials'] });
      toast.success('API credential deleted');
    },
    onError: (error: unknown) => {
      toast.error(`Failed to delete credential: ${(error as Error).message}`);
    }
  });

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this credential?')) {
      await deleteCredentialMutation.mutateAsync(id);
    }
  };

  const isSaving = saveCredentialMutation.isPending;
  const isUpdating = updateCredentialMutation.isPending;
  const isDeleting = deleteCredentialMutation.isPending;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-3xl font-extrabold mb-6 text-blue-900 flex items-center gap-2">
        <span className="inline-block bg-blue-100 text-blue-700 rounded-full px-3 py-1 text-lg">🔑</span>
        Reseller API Credentials
      </h2>
      <p className="text-gray-600 mb-4">
        Manage API credentials for reseller clients only. Admin API credentials are managed in Profile Settings.
      </p>
      <form className="mb-8 flex flex-col md:flex-row gap-3 md:gap-4 items-center bg-white shadow rounded-lg p-4 border border-gray-100" onSubmit={handleAdd}>
        <select
          className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-200 focus:outline-none w-full md:w-1/4"
          value={selectedUserId}
          onChange={e => {
            const value = e.target.value;
            setSelectedUserId(value);
            
            // Auto-populate username for client profiles
            if (value.startsWith('client-')) {
              const clientId = value.replace('client-', '');
              const selectedClient = clientProfiles.find(c => c.id === clientId);
              if (selectedClient) {
                setUsername(selectedClient.username);
              }
            } else {
              // Only allow reseller clients (user_type = 'client')
              const selectedUser = allUsers.find(u => u.id === value);
              if (selectedUser?.user_type === 'client') {
                setUsername('');
              } else {
                // Clear selection if not a reseller client
                setSelectedUserId('');
                toast.error('Only reseller clients can be assigned API credentials');
              }
            }
          }}
          required
          disabled={usersLoading || clientsLoading}
        >
          <option value="">Select Reseller Client</option>
          <optgroup label="Reseller Users">
            {allUsers
              .filter(u => u.user_type === 'client')
              .map(u => (
                <option key={`user-${u.id}`} value={u.id}>
                  {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.email}
                  {' '}[{u.email}] (reseller)
                </option>
              ))}
          </optgroup>
          <optgroup label="Client Profiles">
            {clientProfiles.map(c => (
              <option key={`client-${c.id}`} value={`client-${c.id}`}>
                {c.client_name} [{c.username}] (client)
              </option>
            ))}
          </optgroup>
        </select>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-200 focus:outline-none w-full md:w-1/4"
          required
        />
        <input
          type="text"
          placeholder="Service Name"
          value={serviceName}
          onChange={e => setServiceName(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-200 focus:outline-none w-full md:w-1/4"
          required
        />
        <input
          type="text"
          placeholder="API Key"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-200 focus:outline-none w-full md:w-1/4"
          required
        />
        <button type="submit" className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold px-6 py-2 rounded-md shadow transition disabled:opacity-60" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Add'}
        </button>
      </form>
      {isLoading ? (
        <div className="text-center text-gray-500 py-8">Loading credentials...</div>
      ) : error ? (
        <div className="text-red-600 text-center py-8">Error: {error.message}</div>
      ) : credentials.length === 0 ? (
        <div className="text-center text-gray-400 py-8">No API credentials found.</div>
      ) : (
        <div className="space-y-4">
          {credentials.map(cred => {
            const user = allUsers.find(u => u.id === cred.user_id);
            const client = clientProfiles.find(c => c.user_id === cred.user_id);
            
            // Check if this credential was created for a specific client profile by checking the username
            const isClientCredential = client && cred.username === client.username;
            // If no username match and both user and client exist, prioritize the regular user
            const isClientUser = isClientCredential || (!user && !!client);
            
            return (
              <div key={cred.id} className="bg-white border border-gray-100 shadow-sm rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex-1">
                  <div className="font-semibold text-lg text-blue-800 flex items-center gap-2">
                    <span className="inline-block bg-blue-50 text-blue-600 rounded px-2 py-0.5 text-base">{cred.service_name}</span>
                    {cred.is_active ? <span className="ml-2 text-green-600 text-xs font-medium">Active</span> : <span className="ml-2 text-gray-400 text-xs font-medium">Inactive</span>}
                  </div>
                  <div className="text-gray-500 text-sm mt-1">
                    Assigned to: <span className="font-semibold">
                      {isClientUser 
                        ? `${client.client_name} [${client.username}]`
                        : user
                          ? ((user.first_name || user.last_name)
                              ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                              : user.email) + ` [${user.email}]`
                          : cred.user_id}
                    </span> <span className="ml-2 text-xs text-gray-400">({isClientUser ? 'client' : user?.user_type || 'demo'})</span>
                  </div>
                  <div className="text-gray-500 text-sm mt-1">
                    Created: {new Date(cred.created_at).toLocaleString()}
                  </div>
                  <div className="text-gray-700 text-sm mt-1">
                    API Key: {editId === cred.id ? (
                      <input
                        type="text"
                        value={editApiKey}
                        onChange={e => setEditApiKey(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 w-48 focus:ring-2 focus:ring-blue-200 focus:outline-none"
                        disabled={isUpdating}
                      />
                    ) : cred.api_key_encrypted ? '••••••••' : 'Not set'}
                  </div>
                </div>
                <div className="flex gap-2 mt-2 md:mt-0">
                  {editId === cred.id ? (
                    <>
                      <button
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-1 rounded shadow"
                        onClick={() => handleUpdate(cred.id)}
                        disabled={isUpdating}
                      >
                        {isUpdating ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-1 rounded shadow"
                        onClick={() => setEditId(null)}
                        disabled={isUpdating}
                      >Cancel</button>
                    </>
                  ) : (
                    <>
                      <button
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded shadow"
                        onClick={() => handleEdit(cred.id)}
                        disabled={isUpdating}
                      >Edit</button>
                      <button
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-1 rounded shadow"
                        onClick={() => handleDelete(cred.id)}
                        disabled={isDeleting}
                      >{isDeleting ? 'Deleting...' : 'Delete'}</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApiCredentialsTab;
