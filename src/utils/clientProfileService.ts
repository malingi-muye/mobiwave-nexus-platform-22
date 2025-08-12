import { supabase } from '@/integrations/supabase/client';

// Type definitions for the service responses
interface ProfileData {
  username: string;
  sms_balance: number;
  client_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  user_id: string;
}

interface ProfileSuccessResponse {
  success: true;
  data: ProfileData;
  method: string;
}

interface ProfileErrorResponse {
  success: false;
  error: string;
  details?: any;
}

type ProfileResponse = ProfileSuccessResponse | ProfileErrorResponse;

interface CompleteProfileData extends ProfileData {
  api_key_encrypted: string | null;
}

interface CompleteProfileSuccessResponse {
  success: true;
  data: CompleteProfileData;
  method: string;
}

type CompleteProfileResponse = CompleteProfileSuccessResponse | ProfileErrorResponse;

/**
 * Service for accessing client profiles with proper error handling
 * This bypasses RLS issues by using a more targeted approach
 */
export class ClientProfileService {
  
  /**
   * Fetch client profile by client name with fallback to email
   * Uses a more robust approach to handle RLS restrictions
   */
  static async fetchClientProfile(clientName: string, email: string): Promise<ProfileResponse> {
    try {
      // First attempt: Query by client_name
      const { data: profileByName, error: nameError } = await supabase
        .from('client_profiles')
        .select('username, sms_balance, client_name, email, phone, is_active, user_id')
        .eq('client_name', clientName)
        .limit(1)
        .maybeSingle();

      if (!nameError && profileByName) {
        return { success: true, data: profileByName, method: 'client_name' };
      }

      // Second attempt: Query by email
      const { data: profileByEmail, error: emailError } = await supabase
        .from('client_profiles')
        .select('username, sms_balance, client_name, email, phone, is_active, user_id')
        .eq('email', email)
        .limit(1)
        .maybeSingle();

      if (!emailError && profileByEmail) {
        return { success: true, data: profileByEmail, method: 'email' };
      }

      // Third attempt: Try to query all profiles and filter client-side (if RLS allows)
      const { data: allProfiles, error: allError } = await supabase
        .from('client_profiles')
        .select('username, sms_balance, client_name, email, phone, is_active, user_id');

      if (!allError && allProfiles && allProfiles.length > 0) {
        const matchingProfile = allProfiles.find(profile => 
          profile.client_name === clientName || profile.email === email
        );

        if (matchingProfile) {
          return { success: true, data: matchingProfile, method: 'client_filter' };
        }
      }

      // If all attempts fail, return error information
      return {
        success: false,
        error: 'No matching profile found',
        details: {
          nameError: nameError?.message,
          emailError: emailError?.message,
          allError: allError?.message,
          searchCriteria: { clientName, email }
        }
      };

    } catch (error) {
      return {
        success: false,
        error: 'Unexpected error occurred',
        details: error
      };
    }
  }

  /**
   * Fetch API credentials for a username
   */
  static async fetchApiCredentials(username: string) {
    try {
      const { data: apiCredentials, error: apiError } = await supabase
        .from('api_credentials')
        .select('api_key_encrypted')
        .eq('username', username)
        .eq('service_name', 'mspace')
        .maybeSingle();
      
      if (apiError) {
        return { success: false, error: apiError };
      }

      if (apiCredentials) {
        return { success: true, data: apiCredentials.api_key_encrypted };
      }

      return { success: false, error: 'No API credentials found' };

    } catch (error) {
      return { success: false, error: 'Unexpected error occurred', details: error };
    }
  }

  /**
   * Enhanced client profile fetch with API credentials
   */
  static async fetchCompleteClientProfile(clientName: string, email: string): Promise<CompleteProfileResponse> {
    // First get the profile
    const profileResult = await this.fetchClientProfile(clientName, email);
    
    if (!profileResult.success) {
      return profileResult;
    }

    const profile = profileResult.data;
    
    // Then get API credentials if username exists
    let apiKey = null;
    if (profile.username) {
      const credentialsResult = await this.fetchApiCredentials(profile.username);
      if (credentialsResult.success) {
        apiKey = credentialsResult.data;
      }
    }

    return {
      success: true,
      data: {
        ...profile,
        api_key_encrypted: apiKey
      },
      method: profileResult.method
    };
  }
}