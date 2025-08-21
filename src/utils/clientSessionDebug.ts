// Debug utility for client session data
// This can be called from browser console to check client session state

import { validateClientSession, getCurrentClientSession, refreshClientSession } from './clientProfileUtils';

export const debugClientSession = () => {
  const sessionData = getCurrentClientSession();
  
  if (!sessionData) {
    console.log('❌ No client session found in localStorage');
    return null;
  }

  console.log('✅ Client session found:');
  console.table(sessionData);
  
  // Validate the session
  const validation = validateClientSession(sessionData);
  
  console.log('\n📋 Session Validation:');
  console.log(`Overall Status: ${validation.isValid ? '✅ Valid' : '❌ Invalid'}`);
  console.log(`Has API Key: ${validation.hasApiKey ? '✅ Yes' : '❌ No'}`);
  console.log(`Has Correct Balance: ${validation.hasCorrectBalance ? '✅ Yes' : '❌ No'}`);
  
  if (validation.missingFields.length > 0) {
    console.log('❌ Missing Fields:', validation.missingFields);
  }
  
  // Check for required fields
  const requiredFields = ['user_id', 'email', 'client_name', 'role', 'user_type'];
  const importantFields = ['username', 'sms_balance', 'api_key_encrypted'];
  
  console.log('\n📋 Required Fields:');
  requiredFields.forEach(field => {
    const status = sessionData[field] ? '✅' : '❌';
    console.log(`${status} ${field}: ${sessionData[field] || 'missing'}`);
  });
  
  console.log('\n📋 Important Fields:');
  importantFields.forEach(field => {
    const status = sessionData[field] !== undefined && sessionData[field] !== null ? '✅' : '⚠️';
    const value = field === 'api_key_encrypted' && sessionData[field] ? '[ENCRYPTED]' : (sessionData[field] || 'not set');
    console.log(`${status} ${field}: ${value}`);
  });
  
  return sessionData;
};

export const clearClientSession = () => {
  localStorage.removeItem('client_session');
  console.log('🗑️ Client session cleared from localStorage');
};

export const setTestClientSession = () => {
  const testSession = {
    user_id: '9827ca0a-a689-40aa-9744-53ec16000a92',
    email: 'info@mobiwave.co.ke',
    client_name: 'Mobiwave Innovations',
    role: 'user',
    user_type: 'client',
    username: 'mobiwave_test',
    sms_balance: 1000,
    phone: '+254700000000',
    is_active: true,
    authenticated_at: new Date().toISOString()
  };
  
  localStorage.setItem('client_session', JSON.stringify(testSession));
  console.log('🧪 Test client session created:');
  console.table(testSession);
  return testSession;
};

// Function to check what client profiles exist in the database
export const checkClientProfiles = async () => {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    console.log('🔍 Fetching all client profiles from database...');
    
    const { data: profiles, error } = await supabase
      .from('client_profiles')
      .select('id, client_name, username, email, sms_balance, is_active, created_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Error fetching client profiles:', error);
      return null;
    }
    
    if (!profiles || profiles.length === 0) {
      console.log('⚠️ No client profiles found in database');
      return [];
    }
    
    console.log(`✅ Found ${profiles.length} client profile(s):`);
    console.table(profiles);
    
    // Check if current session matches any profile
    const clientSession = localStorage.getItem('client_session');
    if (clientSession) {
      const sessionData = JSON.parse(clientSession);
      const matchingProfile = profiles.find(p => 
        p.client_name === sessionData.client_name || 
        p.email === sessionData.email
      );
      
      if (matchingProfile) {
        console.log('✅ Found matching profile for current session:');
        console.table(matchingProfile);
      } else {
        console.log('⚠️ No matching profile found for current session');
        console.log('Session client_name:', sessionData.client_name);
        console.log('Session email:', sessionData.email);
      }
    }
    
    return profiles;
  } catch (error) {
    console.error('❌ Failed to check client profiles:', error);
    return null;
  }
};

// Function to refresh client session with latest data from database
export const refreshClientSessionData = async () => {
  console.log('🔄 Refreshing client session data...');
  
  try {
    const refreshedSession = await refreshClientSession();
    
    if (!refreshedSession) {
      console.log('❌ Failed to refresh client session');
      return null;
    }
    
    console.log('✅ Client session refreshed successfully:');
    console.table(refreshedSession);
    
    // Validate the refreshed session
    const validation = validateClientSession(refreshedSession);
    console.log('\n📋 Refreshed Session Status:');
    console.log(`Overall Status: ${validation.isValid ? '✅ Valid' : '❌ Invalid'}`);
    console.log(`Has API Key: ${validation.hasApiKey ? '✅ Yes' : '❌ No'}`);
    console.log(`SMS Balance: ${refreshedSession.sms_balance || 0}`);
    
    return refreshedSession;
  } catch (error) {
    console.error('❌ Error refreshing client session:', error);
    return null;
  }
};

// Make functions available globally for console access
if (typeof window !== 'undefined') {
  (window as any).debugClientSession = debugClientSession;
  (window as any).clearClientSession = clearClientSession;
  (window as any).setTestClientSession = setTestClientSession;
  (window as any).checkClientProfiles = checkClientProfiles;
  (window as any).refreshClientSessionData = refreshClientSessionData;
  
  // Import and expose the create profile function
  import('./createClientProfile').then(module => {
    (window as any).checkAndCreateClientProfile = module.checkAndCreateClientProfile;
    (window as any).createMobiwaveClientProfile = module.createMobiwaveClientProfile;
  });
}