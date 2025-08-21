
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/production-logger';

interface UserAnalytics {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  userGrowthRate: number;
  usersByRole: Record<string, number>;
  usersByType: Record<string, number>;
}

export const useUserAnalytics = () => {
  return useQuery({
    queryKey: ['user-analytics'],
    queryFn: async (): Promise<UserAnalytics> => {
      // Try to get auth users count like UserManagement does
      let totalUsers = 0;
      let users: any[] = [];
      
      try {
        // Get current session for authorization
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // Try to fetch auth users via Edge Function (same as UserManagement)
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
            const authUsers = result.users || [];
            totalUsers = authUsers.length;
            
            // Get profiles for role/type analysis
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, role, user_type, created_at');
            
            // Create lookup map
            const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
            
            // Combine auth users with profile data
            users = authUsers.map((authUser: any) => {
              const profile = profileMap.get(authUser.id);
              return {
                id: authUser.id,
                role: profile?.role || 'user',
                user_type: profile?.user_type || 'demo',
                created_at: authUser.created_at
              };
            });
          } else {
            // Fallback to profiles only if Edge Function fails
            throw new Error('Edge Function not accessible');
          }
        } else {
          throw new Error('No session');
        }
      } catch (error) {
        // Fallback to profiles table only (original behavior)
        log.warn('Falling back to profiles table for user count', { error });
        const { data: profileUsers, error: profileError } = await supabase
          .from('profiles')
          .select('id, role, user_type, created_at');

        if (profileError) throw profileError;
        
        users = profileUsers || [];
        totalUsers = users.length;
      }

      // Add client profiles count (reseller clients stored locally)
      try {
        const { count: clientProfilesCount } = await supabase
          .from('client_profiles')
          .select('*', { count: 'exact', head: true });
        
        totalUsers += clientProfilesCount || 0;
        log.debug('Added client profiles count', { count: clientProfilesCount });
      } catch (error) {
        log.warn('Could not fetch client profiles count', { error });
      }

      // Try to add Mspace API clients (reseller clients and sub users)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // Try to fetch Mspace data via Edge Function
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
              const resellerCount = resellerResult.success ? (resellerResult.data?.length || 0) : 0;
              totalUsers += resellerCount;
              log.debug('Added reseller clients count', { count: resellerCount });
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
              const subUsersCount = subUsersResult.success ? (subUsersResult.data?.length || 0) : 0;
              totalUsers += subUsersCount;
              log.debug('Added sub users count', { count: subUsersCount });
            }
          } catch (error) {
            log.warn('Could not fetch sub users', { error });
          }
        }
      } catch (error) {
        log.warn('Could not fetch Mspace clients', { error });
      }
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      const newUsersThisMonth = users?.filter(user => {
        const userDate = new Date(user.created_at);
        return userDate.getMonth() === currentMonth && userDate.getFullYear() === currentYear;
      }).length || 0;

      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      const newUsersLastMonth = users?.filter(user => {
        const userDate = new Date(user.created_at);
        return userDate.getMonth() === lastMonth && userDate.getFullYear() === lastMonthYear;
      }).length || 0;

      const userGrowthRate = lastMonthYear > 0 ? 
        ((newUsersThisMonth - newUsersLastMonth) / Math.max(newUsersLastMonth, 1)) * 100 : 0;

      const usersByRole = (users || []).reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const usersByType = (users || []).reduce((acc, user) => {
        const type = user.user_type || 'demo';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalUsers,
        activeUsers: totalUsers, // Simplified - could be enhanced with activity tracking
        newUsersThisMonth,
        userGrowthRate,
        usersByRole,
        usersByType
      };
    }
  });
};
