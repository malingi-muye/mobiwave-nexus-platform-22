import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { 
  fetchCompleteClientProfile, 
  refreshClientSession, 
  getCurrentClientSession,
  validateClientSession,
  CompleteClientProfile 
} from '@/utils/clientProfileUtils';

interface UseCompleteClientProfileReturn {
  profile: CompleteClientProfile | null;
  isLoading: boolean;
  error: string | null;
  hasApiKey: boolean;
  smsBalance: number;
  username: string;
  refreshProfile: () => Promise<void>;
  isValid: boolean;
  missingFields: string[];
}

/**
 * Hook to get complete client profile data including SMS balance and API key
 * This hook automatically fetches the latest data from the database and keeps the session updated
 */
export function useCompleteClientProfile(): UseCompleteClientProfileReturn {
  const { user, userRole } = useAuth();
  const [profile, setProfile] = useState<CompleteClientProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user || userRole !== 'user') {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Check if we have a client session
      const sessionData = getCurrentClientSession();
      if (!sessionData) {
        setError('No client session found');
        setIsLoading(false);
        return;
      }

      // Try to fetch complete profile data
      let completeProfile: CompleteClientProfile | null = null;

      // Try different identifiers in order of preference
      if (sessionData.client_name) {
        completeProfile = await fetchCompleteClientProfile(sessionData.client_name, 'client_name');
      }

      if (!completeProfile && sessionData.email) {
        completeProfile = await fetchCompleteClientProfile(sessionData.email, 'email');
      }

      if (!completeProfile && sessionData.username) {
        completeProfile = await fetchCompleteClientProfile(sessionData.username, 'username');
      }

      if (!completeProfile) {
        setError('Could not fetch complete client profile');
        setIsLoading(false);
        return;
      }

      setProfile(completeProfile);
      
      // Update the session with the latest data
      await refreshClientSession();
      
    } catch (err) {
      console.error('Error fetching complete client profile:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [user, userRole]);

  const refreshProfile = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  // Initial fetch
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Validate current session
  const sessionData = getCurrentClientSession();
  const validation = sessionData ? validateClientSession(sessionData) : { 
    isValid: false, 
    missingFields: [], 
    hasApiKey: false, 
    hasCorrectBalance: false 
  };

  return {
    profile,
    isLoading,
    error,
    hasApiKey: !!profile?.api_key_encrypted || validation.hasApiKey,
    smsBalance: profile?.sms_balance ?? sessionData?.sms_balance ?? 0,
    username: profile?.username ?? sessionData?.username ?? '',
    refreshProfile,
    isValid: validation.isValid,
    missingFields: validation.missingFields
  };
}

/**
 * Hook to get just the SMS balance with automatic refresh
 */
export function useSmsBalance(): {
  balance: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const { profile, isLoading, refreshProfile } = useCompleteClientProfile();
  
  return {
    balance: profile?.sms_balance ?? 0,
    isLoading,
    refresh: refreshProfile
  };
}

/**
 * Hook to get just the API key status
 */
export function useApiKeyStatus(): {
  hasApiKey: boolean;
  apiKeyEncrypted: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const { profile, isLoading, refreshProfile } = useCompleteClientProfile();
  
  return {
    hasApiKey: !!profile?.api_key_encrypted,
    apiKeyEncrypted: profile?.api_key_encrypted ?? null,
    isLoading,
    refresh: refreshProfile
  };
}