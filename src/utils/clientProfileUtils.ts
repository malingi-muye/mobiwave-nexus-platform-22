import { supabase } from '@/integrations/supabase/client';

export interface CompleteClientProfile {
  id?: string;
  user_id: string;
  client_name: string;
  username: string;
  email: string;
  phone?: string;
  sms_balance: number;
  is_active: boolean;
  api_key_encrypted?: string | null;
  created_at?: string;
  updated_at?: string;
  last_login?: string;
}

/**
 * Fetches complete client profile data including SMS balance and API key
 * @param identifier - Can be client_name, email, or username
 * @param identifierType - Type of identifier ('client_name', 'email', 'username')
 * @returns Complete client profile with API credentials
 */
export async function fetchCompleteClientProfile(
  identifier: string,
  identifierType: 'client_name' | 'email' | 'username' = 'client_name'
): Promise<CompleteClientProfile | null> {
  try {
    console.log(`Fetching complete client profile by ${identifierType}:`, identifier);

    // First, fetch the client profile data
    const { data: clientProfile, error: profileError } = await supabase
      .from('client_profiles')
      .select('id, user_id, client_name, username, email, phone, sms_balance, is_active, created_at, updated_at, last_login')
      .eq(identifierType, identifier)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching client profile:', profileError);
      return null;
    }

    if (!clientProfile) {
      console.log('No client profile found for identifier:', identifier);
      return null;
    }

    console.log('Client profile found:', clientProfile);

    // Fetch API credentials using the username
    let apiKey: string | null = null;
    if (clientProfile.username) {
      console.log('Fetching API credentials for username:', clientProfile.username);
      
      try {
        const { data: apiCredentials, error: apiError } = await supabase
          .from('api_credentials')
          .select('api_key_encrypted')
          .eq('username', clientProfile.username)
          .eq('service_name', 'mspace')
          .single();

        if (apiError) {
          console.error('Error fetching API credentials:', apiError);
        } else if (apiCredentials) {
          apiKey = apiCredentials.api_key_encrypted;
          console.log('API key found for username:', clientProfile.username);
        }
      } catch (apiError) {
        console.error('Failed to fetch API credentials:', apiError);
      }
    }

    // Return complete profile data
    const completeProfile: CompleteClientProfile = {
      ...clientProfile,
      api_key_encrypted: apiKey
    };

    console.log('Complete client profile assembled:', {
      ...completeProfile,
      api_key_encrypted: apiKey ? '[ENCRYPTED]' : null // Don't log the actual key
    });

    return completeProfile;

  } catch (error) {
    console.error('Failed to fetch complete client profile:', error);
    return null;
  }
}

/**
 * Updates the client session in localStorage with complete profile data
 * @param sessionData - Current session data
 * @param completeProfile - Complete profile data from database
 */
export function updateClientSessionWithCompleteData(
  sessionData: any,
  completeProfile: CompleteClientProfile
): void {
  const updatedSessionData = {
    ...sessionData,
    username: completeProfile.username,
    sms_balance: completeProfile.sms_balance,
    phone: completeProfile.phone || '',
    is_active: completeProfile.is_active,
    api_key_encrypted: completeProfile.api_key_encrypted,
    last_updated: new Date().toISOString(),
    // Preserve existing token and expiration if present
    token: sessionData.token,
    expires_at: sessionData.expires_at
  };

  localStorage.setItem('client_session', JSON.stringify(updatedSessionData));
  console.log('Client session updated with complete profile data');
}

/**
 * Refreshes the current client session with latest data from database
 * @returns Updated session data or null if no session exists
 */
export async function refreshClientSession(): Promise<any | null> {
  try {
    const clientSession = localStorage.getItem('client_session');
    if (!clientSession) {
      console.log('No client session found to refresh');
      return null;
    }

    const sessionData = JSON.parse(clientSession);
    console.log('Refreshing client session for:', sessionData.client_name);

    // Try to fetch by client_name first, then by email as fallback
    let completeProfile = await fetchCompleteClientProfile(sessionData.client_name, 'client_name');
    
    if (!completeProfile && sessionData.email) {
      console.log('Trying fallback query by email');
      completeProfile = await fetchCompleteClientProfile(sessionData.email, 'email');
    }

    if (!completeProfile && sessionData.username) {
      console.log('Trying fallback query by username');
      completeProfile = await fetchCompleteClientProfile(sessionData.username, 'username');
    }

    if (!completeProfile) {
      console.error('Could not refresh client session - profile not found');
      return sessionData; // Return original session data
    }

    // Update session with fresh data
    updateClientSessionWithCompleteData(sessionData, completeProfile);

    // Return updated session data
    const updatedSession = {
      ...sessionData,
      username: completeProfile.username,
      sms_balance: completeProfile.sms_balance,
      phone: completeProfile.phone || '',
      is_active: completeProfile.is_active,
      api_key_encrypted: completeProfile.api_key_encrypted,
      last_updated: new Date().toISOString()
    };

    console.log('Client session refreshed successfully');
    return updatedSession;

  } catch (error) {
    console.error('Failed to refresh client session:', error);
    return null;
  }
}

/**
 * Gets the current client session data from localStorage
 * @returns Current session data or null if no session exists
 */
export function getCurrentClientSession(): any | null {
  try {
    const clientSession = localStorage.getItem('client_session');
    if (!clientSession) {
      return null;
    }
    return JSON.parse(clientSession);
  } catch (error) {
    console.error('Failed to parse client session:', error);
    return null;
  }
}

/**
 * Checks if the client session has all required fields
 * @param sessionData - Session data to validate
 * @returns Object with validation results
 */
export function validateClientSession(sessionData: any): {
  isValid: boolean;
  missingFields: string[];
  hasApiKey: boolean;
  hasCorrectBalance: boolean;
} {
  const requiredFields = ['user_id', 'email', 'client_name', 'role', 'user_type'];
  const importantFields = ['username', 'sms_balance'];
  
  const missingFields: string[] = [];
  
  requiredFields.forEach(field => {
    if (!sessionData[field]) {
      missingFields.push(field);
    }
  });

  importantFields.forEach(field => {
    if (sessionData[field] === undefined || sessionData[field] === null) {
      missingFields.push(field);
    }
  });

  const hasApiKey = !!sessionData.api_key_encrypted;
  const hasCorrectBalance = typeof sessionData.sms_balance === 'number' && sessionData.sms_balance >= 0;

  return {
    isValid: missingFields.length === 0,
    missingFields,
    hasApiKey,
    hasCorrectBalance
  };
}