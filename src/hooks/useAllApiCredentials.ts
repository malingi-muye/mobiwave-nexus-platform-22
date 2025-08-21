import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/types/supabase';

type ApiCredentialRow = Database['public']['Tables']['api_credentials']['Row'];
type AuditEntryRow = Database['public']['Tables']['api_credentials_audit']['Row'];

interface ApiCredential {
  id: string;
  user_id: string;
  api_key_encrypted?: string;
  api_key_hash?: string;
  service_name: string;
  username?: string;
  key_name?: string;
  is_active: boolean;
  status?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
  permissions?: string[];
  user_email?: string;
  role: string;
  onDelete?: (id: string) => void;
  table_source: 'api_credentials' | 'admin_api_keys';
}

type AuditEntry = AuditEntryRow;

export function useAllApiCredentials() {
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);

  const fetchCredentials = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch from both tables and combine
      const [apiCredsResponse, adminKeysResponse] = await Promise.all([
        // Regular API credentials
        supabase
          .from('api_credentials')
          .select(`
            id, user_id, api_key_encrypted, service_name, username, is_active, 
            expires_at, created_at, updated_at,
            profiles!inner(email, role)
          `)
          .order('created_at', { ascending: false }),
        
        // Admin API keys
        supabase
          .from('admin_api_keys')
          .select(`
            id, user_id, api_key_hash, key_name, status, permissions, 
            expires_at, created_at, updated_at,
            profiles!inner(email, role)
          `)
          .order('created_at', { ascending: false })
      ]);

      if (apiCredsResponse.error) throw apiCredsResponse.error;
      if (adminKeysResponse.error) throw adminKeysResponse.error;

      const allCredentials: ApiCredential[] = [];

      // Process regular API credentials
      (apiCredsResponse.data || []).forEach((row: any) => {
        allCredentials.push({
          ...row,
          service_name: row.service_name || 'mspace',
          user_email: row.profiles?.email,
          role: row.profiles?.role || 'user',
          table_source: 'api_credentials',
          onDelete: handleDelete,
        });
      });

      // Process admin API keys
      (adminKeysResponse.data || []).forEach((row: any) => {
        allCredentials.push({
          ...row,
          service_name: 'mspace', // Admin keys are always mspace
          username: row.key_name,
          api_key_encrypted: row.api_key_hash,
          is_active: row.status === 'active',
          user_email: row.profiles?.email,
          role: row.profiles?.role || 'admin',
          table_source: 'admin_api_keys',
          onDelete: handleDelete,
        });
      });

      // Sort by creation date
      allCredentials.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setCredentials(allCredentials);

      // Fetch audit history (keep existing logic for now)
      const { data: auditData, error: auditError } = await (supabase as any)
        .from('api_credentials_audit')
        .select('*')
        .order('timestamp', { ascending: false });
      if (!auditError && auditData) {
        setAuditHistory(auditData as AuditEntry[]);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch API credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, actorId?: string, actorEmail?: string) => {
    setIsLoading(true);
    try {
      // Find the credential to determine which table to delete from
      const credential = credentials.find(c => c.id === id);
      if (!credential) throw new Error('Credential not found');

      const table = credential.table_source;
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;

      // Audit log
      await (supabase as any).from('api_credentials_audit').insert({
        credential_id: id,
        action: 'delete',
        actor_id: actorId ?? null,
        actor_email: actorEmail ?? null,
        timestamp: new Date().toISOString(),
        details: { table_source: table },
      });
      await fetchCredentials();
    } catch (e: any) {
      setError(e.message || 'Failed to delete API credential');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCredential = async (id: string, updates: any, actorId?: string, actorEmail?: string) => {
    setIsLoading(true);
    try {
      // Find the credential to determine which table to update
      const credential = credentials.find(c => c.id === id);
      if (!credential) throw new Error('Credential not found');

      const table = credential.table_source;
      
      // Transform updates based on table structure
      let transformedUpdates = { ...updates };
      if (table === 'admin_api_keys') {
        // Map common fields to admin_api_keys structure
        if ('is_active' in updates) {
          transformedUpdates.status = updates.is_active ? 'active' : 'inactive';
          delete transformedUpdates.is_active;
        }
        if ('username' in updates) {
          transformedUpdates.key_name = updates.username;
          delete transformedUpdates.username;
        }
      }

      const { error } = await supabase.from(table).update(transformedUpdates).eq('id', id);
      if (error) throw error;

      // Audit log
      await (supabase as any).from('api_credentials_audit').insert({
        credential_id: id,
        action: 'edit',
        actor_id: actorId ?? null,
        actor_email: actorEmail ?? null,
        timestamp: new Date().toISOString(),
        details: { ...updates, table_source: table },
      });
      await fetchCredentials();
    } catch (e: any) {
      setError(e.message || 'Failed to update API credential');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    credentials,
    isLoading,
    error,
    refresh: fetchCredentials,
    auditHistory,
    updateCredential,
    deleteCredential: handleDelete,
  };
}
