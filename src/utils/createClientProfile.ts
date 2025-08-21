import { supabase } from '@/integrations/supabase/client';

export interface CreateClientProfileData {
  user_id: string;
  client_name: string;
  username: string;
  email: string;
  phone?: string;
  sms_balance?: number;
  is_active?: boolean;
}

/**
 * Creates a new client profile in the database
 */
export async function createClientProfile(profileData: CreateClientProfileData) {
  try {
    const { data, error } = await supabase
      .from('client_profiles')
      .insert({
        user_id: profileData.user_id,
        client_name: profileData.client_name,
        username: profileData.username,
        email: profileData.email,
        phone: profileData.phone || null,
        sms_balance: profileData.sms_balance || 0,
        is_active: profileData.is_active !== false, // Default to true
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };

  } catch (error) {
    return { success: false, error };
  }
}

/**
 * Creates the missing Mobiwave client profile based on the session data
 */
export async function createMobiwaveClientProfile() {
  const sessionData = localStorage.getItem('client_session');
  if (!sessionData) {
    console.error('No client session found');
    return { success: false, error: 'No client session found' };
  }

  const session = JSON.parse(sessionData);
  
  const profileData: CreateClientProfileData = {
    user_id: session.user_id,
    client_name: session.client_name,
    username: session.username || 'mobiwave_client', // Provide a default username
    email: session.email,
    phone: session.phone || null,
    sms_balance: 1500, // Set initial balance
    is_active: true
  };

  return await createClientProfile(profileData);
}

/**
 * Check and create missing client profile if needed
 */
export async function checkAndCreateClientProfile() {
  // First check what profiles exist
  const { data: profiles, error: fetchError } = await supabase
    .from('client_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('Error fetching profiles:', fetchError);
    return { success: false, error: fetchError };
  }

  // Check current session
  const sessionData = localStorage.getItem('client_session');
  if (!sessionData) {
    return { success: false, error: 'No client session found' };
  }

  const session = JSON.parse(sessionData);

  // Check if profile exists for this session
  const existingProfile = profiles?.find(p => 
    p.client_name === session.client_name || 
    p.email === session.email ||
    p.user_id === session.user_id
  );

  if (existingProfile) {
    return { success: true, data: existingProfile };
  }

  // Create new profile if none exists
  const result = await createMobiwaveClientProfile();
  
  if (result.success) {
    // Refresh the page to reload with new profile
    window.location.reload();
  }

  return result;
}