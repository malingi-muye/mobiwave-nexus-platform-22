# Admin Session Management - Lint Fixes

## Issues Fixed

### 1. Replaced `any` types with specific types
- **Problem**: Multiple `any` type annotations were causing Deno lint errors
- **Solution**: Replaced all `any` types with proper TypeScript interfaces

### 2. Removed unnecessary `async` keyword
- **Problem**: `generateSessionToken` function was marked as `async` but had no `await` expressions
- **Solution**: Removed `async` keyword and updated the return type

## Changes Made

### Type Definitions Added
```typescript
interface LocationData {
  country?: string;
  city?: string;
  region?: string;
  ip?: string;
}
```

### Import Updates
```typescript
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

### Function Signature Updates

#### Before:
```typescript
async function generateSessionToken(): Promise<string>
async function listAdminSessions(userId: string, supabase: any)
async function createAdminSession(userId: string, sessionData: any, req: Request, supabase: any, supabaseAdmin: any)
async function terminateAdminSession(userId: string, sessionId: string, supabase: any, supabaseAdmin: any)
async function terminateAllAdminSessions(userId: string, supabase: any, supabaseAdmin: any)
async function updateSessionActivity(userId: string, sessionId: string, supabase: any)
async function getAdminSecurityLog(userId: string, supabase: any)
```

#### After:
```typescript
function generateSessionToken(): string
async function listAdminSessions(userId: string, supabase: SupabaseClient)
async function createAdminSession(userId: string, sessionData: SessionRequest['sessionData'], req: Request, supabase: SupabaseClient, supabaseAdmin: SupabaseClient)
async function terminateAdminSession(userId: string, sessionId: string, supabase: SupabaseClient, supabaseAdmin: SupabaseClient)
async function terminateAllAdminSessions(userId: string, supabase: SupabaseClient, supabaseAdmin: SupabaseClient)
async function updateSessionActivity(userId: string, sessionId: string, supabase: SupabaseClient)
async function getAdminSecurityLog(userId: string, supabase: SupabaseClient)
```

### Interface Updates
```typescript
interface SessionRequest {
  action: 'list' | 'create' | 'terminate' | 'terminateAll' | 'updateActivity' | 'getSecurityLog';
  sessionId?: string;
  sessionData?: {
    ip_address?: string;
    user_agent?: string;
    location?: LocationData; // Changed from 'any' to 'LocationData'
  };
}
```

### Removed Type Annotations
```typescript
// Before
const safeSessions = sessions.map((session: any) => ({

// After  
const safeSessions = sessions.map((session) => ({
```

## Benefits

1. **Type Safety**: All functions now have proper type annotations
2. **Better IntelliSense**: IDEs can provide better autocomplete and error detection
3. **Lint Compliance**: Passes all Deno lint checks
4. **Maintainability**: Code is more self-documenting with explicit types
5. **Runtime Safety**: Reduced risk of runtime type errors

## Verification

The file now passes Deno lint without any errors:
```bash
deno lint supabase/functions/admin-session-management/index.ts
# Output: Checked 1 file
```

All 13 lint errors have been resolved:
- ✅ Fixed 12 `no-explicit-any` errors
- ✅ Fixed 1 `require-await` error

The function maintains all its original functionality while being properly typed and lint-compliant.