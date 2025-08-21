
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import React from 'react';

export function useAuthActions(setIsLoading: (loading: boolean) => void, setUser: React.Dispatch<React.SetStateAction<User | null>>, setSession: React.Dispatch<React.SetStateAction<Session | null>>, setUserRole: React.Dispatch<React.SetStateAction<string | null>>) {
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      console.log('Attempting login for:', email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        throw error;
      }

      console.log('Login successful for:', data.user?.email);
    } catch (error) {
      console.error('Login failed:', error);
      setIsLoading(false);
      throw error;
    }
  };

  const logout = async () => {
    try {
      console.log('Logging out...');
      
      // Clear client profile session from localStorage
      localStorage.removeItem('client_session');
      
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      setUser(null);
      setSession(null);
      setUserRole(null);
      console.log('Logout successful');
    } catch (error) {
      console.error('Logout failed:', error);
      
      // Even if Supabase logout fails, clear local state for client profiles
      localStorage.removeItem('client_session');
      setUser(null);
      setSession(null);
      setUserRole(null);
      
      throw error;
    }
  };

  return { login, logout };
}
