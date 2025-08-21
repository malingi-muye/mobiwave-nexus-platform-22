# Client Profile Session Enhancement

## Problem
The client profile session object was missing important values like the correct SMS balance from the `client_profiles` table and the API key from the `api_credentials` table. The session only contained basic information and had an SMS balance of 0.

## Solution
Enhanced the client session management to automatically fetch and include complete profile data from both `client_profiles` and `api_credentials` tables using the username as the key.

## Changes Made

### 1. Enhanced Authentication State Management
**File**: `src/components/auth/auth-provider/useAuthState.ts`

- Modified the client session loading logic to fetch complete profile data
- Added API key fetching from `api_credentials` table using username
- Updated MockUser interface to include `api_key_encrypted` field
- Added fallback mechanisms for different query strategies (client_name, email, username)
- Enhanced error handling and logging

### 2. Created Client Profile Utilities
**File**: `src/utils/clientProfileUtils.ts`

New utility functions:
- `fetchCompleteClientProfile()` - Fetches complete profile data including API key
- `updateClientSessionWithCompleteData()` - Updates localStorage with complete data
- `refreshClientSession()` - Refreshes session with latest database data
- `getCurrentClientSession()` - Gets current session data
- `validateClientSession()` - Validates session completeness

### 3. Enhanced Debug Utilities
**File**: `src/utils/clientSessionDebug.ts`

Enhanced debugging capabilities:
- Better session validation and reporting
- Added `refreshClientSessionData()` function
- Improved field status checking
- Added API key status (without exposing the actual key)

### 4. Created React Hooks
**File**: `src/hooks/useCompleteClientProfile.ts`

New hooks for easy access to profile data:
- `useCompleteClientProfile()` - Main hook for complete profile access
- `useSmsBalance()` - Specific hook for SMS balance
- `useApiKeyStatus()` - Specific hook for API key status

### 5. Created UI Component
**File**: `src/components/client/ClientProfileStatus.tsx`

React component to display profile status:
- Shows profile completeness status
- Displays SMS balance and API key availability
- Provides refresh functionality
- Available in compact and full modes

## How It Works

### Session Enhancement Flow
1. When a client session is detected in localStorage
2. The system queries `client_profiles` table using client_name (primary) or email (fallback)
3. If a profile is found, it fetches the API key from `api_credentials` using the username
4. The session is updated with complete data including:
   - Correct SMS balance from database
   - API key (encrypted) from credentials table
   - Phone number, active status, etc.
5. The enhanced session is saved back to localStorage

### Database Queries
```sql
-- Fetch client profile
SELECT username, sms_balance, client_name, email, phone, is_active 
FROM client_profiles 
WHERE client_name = ? OR email = ?

-- Fetch API credentials
SELECT api_key_encrypted 
FROM api_credentials 
WHERE username = ? AND service_name = 'mspace'
```

## Usage Examples

### 1. Using the Hook in Components
```typescript
import { useCompleteClientProfile } from '@/hooks/useCompleteClientProfile';

function MyComponent() {
  const { 
    profile, 
    isLoading, 
    hasApiKey, 
    smsBalance, 
    username, 
    refreshProfile 
  } = useCompleteClientProfile();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <p>Username: {username}</p>
      <p>SMS Balance: {smsBalance}</p>
      <p>API Key: {hasApiKey ? 'Available' : 'Missing'}</p>
      <button onClick={refreshProfile}>Refresh</button>
    </div>
  );
}
```

### 2. Using the Status Component
```typescript
import { ClientProfileStatus } from '@/components/client/ClientProfileStatus';

function Dashboard() {
  return (
    <div>
      {/* Full status card */}
      <ClientProfileStatus />
      
      {/* Compact status badges */}
      <ClientProfileStatus compact showRefreshButton={false} />
    </div>
  );
}
```

### 3. Debug Functions (Browser Console)
```javascript
// Check current session status
debugClientSession()

// Refresh session with latest data
await refreshClientSessionData()

// Check all client profiles in database
await checkClientProfiles()

// Clear session
clearClientSession()
```

## Session Data Structure

### Before Enhancement
```javascript
{
  authenticated_at: "2025-08-08T07:58:43.051Z",
  client_name: "Mobiwave Innovations",
  email: "info@mobiwave.co.ke",
  role: "user",
  sms_balance: 0,  // ❌ Always 0
  user_id: "9827ca0a-a689-40aa-9744-53ec16000a92",
  user_type: "client",
  username: "Mobiwave"  // ❌ May not be correct
}
```

### After Enhancement
```javascript
{
  authenticated_at: "2025-08-08T07:58:43.051Z",
  client_name: "Mobiwave Innovations",
  email: "info@mobiwave.co.ke",
  role: "user",
  sms_balance: 1500,  // ✅ Actual balance from database
  user_id: "9827ca0a-a689-40aa-9744-53ec16000a92",
  user_type: "client",
  username: "mobiwave_client",  // ✅ Correct username from database
  phone: "+254700000000",  // ✅ Phone number
  is_active: true,  // ✅ Active status
  api_key_encrypted: "encrypted_api_key_here",  // ✅ API key for services
  last_updated: "2025-08-08T08:15:30.123Z"  // ✅ Last refresh timestamp
}
```

## Benefits

1. **Complete Data**: Session now contains all necessary client information
2. **Real-time Balance**: SMS balance is always current from database
3. **API Integration**: API key is available for service calls
4. **Automatic Refresh**: Session data stays synchronized with database
5. **Better Debugging**: Enhanced tools for troubleshooting session issues
6. **Type Safety**: TypeScript interfaces ensure data consistency
7. **Error Handling**: Robust fallback mechanisms for data fetching
8. **Performance**: Efficient caching with manual refresh capability

## Testing

To test the enhancement:

1. **Check Current Session**:
   ```javascript
   debugClientSession()
   ```

2. **Refresh Session Data**:
   ```javascript
   await refreshClientSessionData()
   ```

3. **Verify Database Data**:
   ```javascript
   await checkClientProfiles()
   ```

4. **Use in Components**:
   - Import and use `useCompleteClientProfile` hook
   - Add `ClientProfileStatus` component to dashboard

The enhancement ensures that client profile sessions always have complete, up-to-date information from the database, resolving the issue of missing SMS balance and API key data.