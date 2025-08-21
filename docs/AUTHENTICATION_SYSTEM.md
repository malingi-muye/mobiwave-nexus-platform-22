# Mobiwave Nexus Authentication System

## Overview

The Mobiwave Nexus platform now uses a **separate login system** that authenticates different user types through dedicated login portals. This resolves the previous issue where using one profile type would eliminate authorization for other profile types.

## User Types & Authentication

### 1. Client Profiles (Reseller Clients)
- **Table**: `client_profiles`
- **Authentication**: Custom authentication via `authenticate_client_profile` RPC function
- **Login Portal**: `/auth/client`
- **Features**: 
  - SMS services access
  - Balance management
  - Campaign tools
  - No signup option (accounts created by admins)

### 2. Admin Users (System Administrators)
- **Table**: `profiles` (linked to `auth.users`)
- **Authentication**: Supabase Auth + role from `profiles`
- **Login Portal**: `/auth/admin`
- **Roles**: `admin`, `super_admin`
- **Features**:
  - System administration
  - User management
  - Analytics & reports
  - No signup option (accounts created by super admins)

### 3. Regular Users (Standard Users)
- **Table**: `profiles` (linked to `auth.users`)
- **Authentication**: Standard Supabase Auth
- **Login Portal**: `/auth/user`
- **Roles**: `user`, `manager`
- **Features**:
  - Service requests
  - Plan management
  - Account registration available

## Login Flow

### Main Login Selection (`/auth`)
Users are presented with three login options:
1. **Admin Portal** - For system administrators
2. **Client Portal** - For reseller clients
3. **User Portal** - For regular users with signup option

### Authentication Process

#### Client Authentication
1. User enters email/username and password at `/auth/client`
2. System calls `authenticate_client_profile` RPC function
3. If successful, creates client session in localStorage
4. Redirects to `/dashboard` with client role

#### Admin Authentication
1. User enters email and password at `/auth/admin`
2. System authenticates via Supabase Auth
3. Fetches role from `profiles.role`
4. Validates role is `admin` or `super_admin`
5. Redirects to `/admin` dashboard

#### Regular User Authentication
1. User enters email and password at `/auth/user`
2. System authenticates via Supabase Auth
3. Fetches role from `profiles` table
4. Redirects to `/dashboard` with user role

## Database Schema

### Client Profiles
```sql
CREATE TABLE client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_name VARCHAR(255) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  sms_balance INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  -- ... other fields
);
```

### Admin Users Schema Note
```sql
-- Admin-specific fields (optional) can be added to profiles if needed:
-- ALTER TABLE profiles ADD COLUMN phone VARCHAR(20);
-- ALTER TABLE profiles ADD COLUMN company VARCHAR(255);
-- ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
-- ALTER TABLE profiles ADD COLUMN avatar_file_name TEXT;
-- ...
```

### Regular Profiles
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  first_name TEXT,
  last_name TEXT,
  role VARCHAR(50) DEFAULT 'user',
  -- ... other fields
);
```

## Setup Instructions

### 1. Database Migration
Run the migration to create demo users:
```bash
# Apply the migration
supabase db push

# Or manually run the migration file
psql -f supabase/migrations/20250130000000_create_demo_admin_users.sql
```

### 2. Create Demo Users
Use the setup script to create demo users with proper auth entries:
```bash
# Install dependencies
npm install @supabase/supabase-js dotenv

# Set environment variables
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run the setup script
node scripts/setup-demo-users.js
```

### 3. Demo Credentials
After setup, you can test with these credentials:

**Super Admin:**
- Email: `superadmin@mobiwave.com`
- Password: `SuperAdmin123!`
- Portal: `/auth/admin`

**Admin:**
- Email: `admin@mobiwave.com`
- Password: `Admin123!`
- Portal: `/auth/admin`

**Demo User:**
- Email: `demo@mobiwave.com`
- Password: `Demo123!`
- Portal: `/auth/user`

## File Structure

### New Authentication Components
```
src/components/auth/
├── LoginSelection.tsx          # Main login portal selection
├── AdminLoginForm.tsx          # Admin-specific login form
├── ClientLoginForm.tsx         # Client-specific login form
├── UserAuthPage.tsx           # Regular user login with signup
├── login/
│   ├── useAdminLoginHandler.ts    # Admin authentication logic
│   ├── useClientLoginHandler.ts   # Client authentication logic
│   └── useUserLoginHandler.ts     # Regular user authentication logic
```

### Updated Routes
```
/auth                 # Login selection page
/auth/admin          # Admin login portal
/auth/client         # Client login portal
/auth/user           # User login portal (with signup)
```

## Security Features

### Client Authentication
- Password hashing with bcrypt
- Account activation status checking
- Session management via localStorage
- Last login tracking

### Admin Authentication
- Supabase Auth integration
- Role-based access control
- Admin profile verification
- Enhanced security settings

### Regular User Authentication
- Standard Supabase Auth
- Account lockout after failed attempts
- Email confirmation required
- Password reset functionality

## Troubleshooting

### Common Issues

1. **"Access denied" for admin login**
   - Ensure user exists and is confirmed in `auth.users`
   - Verify role is `admin` or `super_admin` in `profiles.role`

2. **Client login fails**
   - Verify `authenticate_client_profile` RPC function exists
   - Check client account is active (`is_active = true`)
   - Ensure password hash is correct

3. **User redirected to wrong dashboard**
   - Check role assignment in `profiles.role` (admins) or `client_profiles` (clients)
   - Clear localStorage and browser cache

### Debugging

Enable debug logging by checking browser console for:
- Authentication state changes
- Role fetching process
- Session management
- Routing decisions

## Migration from Old System

If migrating from the previous unified login system:

1. **Backup existing data**
2. **Run database migrations**
3. **Update client applications** to use new login URLs
4. **Test each user type** thoroughly
5. **Update documentation** and user guides

## Future Enhancements

- Two-factor authentication for admin accounts
- SSO integration for enterprise clients
- Advanced session management
- Audit logging for admin actions
- Role-based permissions system