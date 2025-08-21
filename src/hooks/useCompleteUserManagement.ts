
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/production-logger';

interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  email_confirmed_at?: string;
  last_sign_in_at?: string;
  raw_user_meta_data?: any;
}

interface ProfileUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  user_type?: string;
  created_at: string;
}

interface UserCredits {
  user_id: string;
  balance: number;
  total_purchased: number;
  credits_remaining?: number;
  credits_purchased?: number;
}

export interface CompleteUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role?: string;
  user_type?: string;
  created_at: string;
  email_confirmed_at?: string;
  last_sign_in_at?: string;
  credits_remaining?: number;
  credits_purchased?: number;
  has_profile: boolean;
  raw_user_meta_data?: any;
}

export const useCompleteUserManagement = (searchTerm: string, roleFilter: string, userTypeFilter: string) => {
  const { data: users, isLoading, error, refetch } = useQuery({
    queryKey: ['complete-user-management', searchTerm, roleFilter, userTypeFilter],
    queryFn: async (): Promise<CompleteUser[]> => {
      log.debug('Fetching complete user data...');
      
      try {
        // Check if we have admin access by attempting to fetch auth users via Edge Function
        log.debug('Checking admin access via Edge Function...');
        let authUsers: any[] = [];
        let hasAdminAccess = false;
        
        try {
          // Get current session for authorization
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session) {
            // Use the correct Edge Function URL format
            const functionUrl = `https://axkvnjozueyhjdmmbjgg.supabase.co/functions/v1/admin-users`;
            
            const response = await fetch(functionUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4a3Zuam96dWV5aGpkbW1iamdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNzU0MTgsImV4cCI6MjA2ODk1MTQxOH0.S9BzFd4Ks9TjpmtdzzCqWKsN5uxcIl1CO71ebShahvA'
              }
            });

            if (response.ok) {
              const result = await response.json();
              authUsers = result.users || [];
              hasAdminAccess = true;
              log.info('Admin access confirmed via Edge Function', { userCount: authUsers.length });
            } else {
              const errorText = await response.text();
              log.warn('Admin access denied via Edge Function', { status: response.status, error: errorText });
            }
          } else {
            log.warn('No active session found');
          }
        } catch (adminError) {
          log.warn('Edge Function not accessible', { error: adminError });
        }

        // Always fetch profiles and credits
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('*');
        if (profileError) throw profileError;
        log.debug('Fetched profiles', { count: profiles?.length || 0 });

        const { data: credits, error: creditsError } = await supabase
          .from('user_credits')
          .select('*');
        if (creditsError) throw creditsError;
        log.debug('Fetched credits', { count: credits?.length || 0 });

        // Create lookup maps
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        const creditsMap = new Map(credits?.map(c => [c.user_id, c]) || []);

        let combinedUsers: CompleteUser[] = [];

        if (hasAdminAccess && authUsers.length > 0) {
          // If we have admin access, combine auth users with profiles
          log.debug('Using auth + profiles mode');
          combinedUsers = authUsers.map(authUser => {
            const profile = profileMap.get(authUser.id);
            const userCredits = creditsMap.get(authUser.id);

            return {
              id: authUser.id,
              email: authUser.email || '',
              first_name: profile?.first_name || authUser.user_metadata?.first_name,
              last_name: profile?.last_name || authUser.user_metadata?.last_name,
              role: profile?.role || 'user',
              user_type: profile?.user_type || 'demo',
              created_at: authUser.created_at,
              email_confirmed_at: authUser.email_confirmed_at,
              last_sign_in_at: authUser.last_sign_in_at,
              credits_remaining: userCredits?.credits_remaining || 0,
              credits_purchased: userCredits?.credits_purchased || 0,
              has_profile: !!profile,
              raw_user_meta_data: authUser.user_metadata
            };
          });
        } else {
          // If no admin access, work with profiles only
          log.debug('Using profiles-only mode');
          combinedUsers = (profiles || []).map(profile => {
            const userCredits = creditsMap.get(profile.id);
            return {
              id: profile.id,
              email: profile.email,
              first_name: profile.first_name,
              last_name: profile.last_name,
              role: profile.role,
              user_type: profile.user_type || 'demo',
              created_at: profile.created_at,
              email_confirmed_at: undefined, // Not available without auth data
              last_sign_in_at: undefined,
              credits_remaining: userCredits?.credits_remaining || 0,
              credits_purchased: userCredits?.credits_purchased || 0,
              has_profile: true,
              raw_user_meta_data: {}
            };
          });
        }

        log.debug('Combined users before filtering', { count: combinedUsers.length });
        
        // Store the base user count for stats calculation
        const baseUserCount = combinedUsers.length;
        
        // Return both filtered users and additional client counts for stats
        return {
          users: applyFilters(combinedUsers, searchTerm, roleFilter, userTypeFilter),
          baseUserCount,
          additionalClientCounts: await getAdditionalClientCounts()
        };
        
      } catch (error) {
        log.error('Error fetching user data', { error });
        throw error;
      }
    }
  });

  // Helper function to get additional client counts
  const getAdditionalClientCounts = async () => {
    let clientProfilesCount = 0;
    let resellerClientsCount = 0;
    let subUsersCount = 0;

    // Get client profiles count
    try {
      const { count } = await supabase
        .from('client_profiles')
        .select('*', { count: 'exact', head: true });
      clientProfilesCount = count || 0;
    } catch (error) {
      log.warn('Could not fetch client profiles count', { error });
    }

    // Get Mspace API clients
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const mspaceUrl = `https://axkvnjozueyhjdmmbjgg.supabase.co/functions/v1/mspace-api`;
        
        // Fetch reseller clients
        try {
          const resellerResponse = await fetch(mspaceUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4a3Zuam96dWV5aGpkbW1iamdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNzU0MTgsImV4cCI6MjA2ODk1MTQxOH0.S9BzFd4Ks9TjpmtdzzCqWKsN5uxcIl1CO71ebShahvA'
            },
            body: JSON.stringify({ operation: 'resellerClients' })
          });

          if (resellerResponse.ok) {
            const resellerResult = await resellerResponse.json();
            resellerClientsCount = resellerResult.success ? (resellerResult.data?.length || 0) : 0;
          }
        } catch (error) {
          log.warn('Could not fetch reseller clients', { error });
        }

        // Fetch sub users
        try {
          const subUsersResponse = await fetch(mspaceUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4a3Zuam96dWV5aGpkbW1iamdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNzU0MTgsImV4cCI6MjA2ODk1MTQxOH0.S9BzFd4Ks9TjpmtdzzCqWKsN5uxcIl1CO71ebShahvA'
            },
            body: JSON.stringify({ operation: 'subUsers' })
          });

          if (subUsersResponse.ok) {
            const subUsersResult = await subUsersResponse.json();
            subUsersCount = subUsersResult.success ? (subUsersResult.data?.length || 0) : 0;
          }
        } catch (error) {
          log.warn('Could not fetch sub users', { error });
        }
      }
    } catch (error) {
      log.warn('Could not fetch Mspace clients', { error });
    }

    return { clientProfilesCount, resellerClientsCount, subUsersCount };
  };

  const applyFilters = (userList: CompleteUser[], search: string, role: string, userType: string) => {
    let filteredUsers = userList;

    if (search) {
      filteredUsers = filteredUsers.filter(user =>
        user.email.toLowerCase().includes(search.toLowerCase()) ||
        user.first_name?.toLowerCase().includes(search.toLowerCase()) ||
        user.last_name?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (role !== 'all') {
      filteredUsers = filteredUsers.filter(user => user.role === role);
    }

    if (userType !== 'all') {
      filteredUsers = filteredUsers.filter(user => user.user_type === userType);
    }

    return filteredUsers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  // Extract data from the query result
  const queryResult = data;
  const filteredUsers = queryResult?.users || [];
  const baseUserCount = queryResult?.baseUserCount || 0;
  const additionalClientCounts = queryResult?.additionalClientCounts || {
    clientProfilesCount: 0,
    resellerClientsCount: 0,
    subUsersCount: 0
  };

  // Calculate total including all client types
  const totalAllClients = baseUserCount + 
    additionalClientCounts.clientProfilesCount + 
    additionalClientCounts.resellerClientsCount + 
    additionalClientCounts.subUsersCount;

  const stats = {
    total: totalAllClients,
    base_users: baseUserCount,
    client_profiles: additionalClientCounts.clientProfilesCount,
    reseller_clients: additionalClientCounts.resellerClientsCount,
    sub_users: additionalClientCounts.subUsersCount,
    with_profiles: filteredUsers?.filter(u => u.has_profile).length || 0,
    without_profiles: filteredUsers?.filter(u => !u.has_profile).length || 0,
    admin_users: filteredUsers?.filter(u => u.role === 'admin' || u.role === 'super_admin').length || 0,
    confirmed: filteredUsers?.filter(u => u.email_confirmed_at).length || 0
  };

  return {
    users: filteredUsers,
    isLoading,
    error,
    stats,
    refetch
  };
};
