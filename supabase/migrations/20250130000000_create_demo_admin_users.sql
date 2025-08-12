-- Create demo and admin users migration
-- This migration creates demo users and admin users for testing the separate login system

-- Function to create admin user with profile
CREATE OR REPLACE FUNCTION create_admin_user(
  user_email TEXT,
  user_password TEXT,
  admin_role TEXT DEFAULT 'admin',
  user_phone TEXT DEFAULT NULL,
  user_company TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id UUID;
  auth_user_id UUID;
BEGIN
  -- Create user in auth.users (this would normally be done via Supabase Auth API)
  -- For demo purposes, we'll create a placeholder entry
  -- In production, use Supabase Admin API to create users
  
  -- Generate a UUID for the user
  new_user_id := gen_random_uuid();
  
  -- Insert into admin_profiles table
  INSERT INTO public.admin_profiles (
    user_id,
    phone,
    company,
    role,
    created_at,
    updated_at
  ) VALUES (
    new_user_id,
    user_phone,
    user_company,
    admin_role,
    NOW(),
    NOW()
  );
  
  -- Insert into admin_security_settings
  INSERT INTO public.admin_security_settings (
    user_id,
    two_factor_enabled,
    session_timeout,
    password_change_required,
    created_at,
    updated_at
  ) VALUES (
    new_user_id,
    false,
    3600,
    false,
    NOW(),
    NOW()
  );
  
  -- Insert into admin_preferences
  INSERT INTO public.admin_preferences (
    user_id,
    theme,
    timezone,
    date_format,
    time_format,
    email_notifications,
    sms_notifications,
    system_alerts,
    security_alerts,
    created_at,
    updated_at
  ) VALUES (
    new_user_id,
    'light',
    'Africa/Nairobi',
    'DD/MM/YYYY',
    '24h',
    true,
    true,
    true,
    true,
    NOW(),
    NOW()
  );
  
  RETURN new_user_id;
END;
$$;

-- Function to create demo user with profile
CREATE OR REPLACE FUNCTION create_demo_user(
  user_email TEXT,
  user_password TEXT,
  user_first_name TEXT DEFAULT 'Demo',
  user_last_name TEXT DEFAULT 'User'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id UUID;
BEGIN
  -- Generate a UUID for the user
  new_user_id := gen_random_uuid();
  
  -- Insert into profiles table
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    role,
    created_at,
    updated_at
  ) VALUES (
    new_user_id,
    user_first_name,
    user_last_name,
    'user',
    NOW(),
    NOW()
  );
  
  RETURN new_user_id;
END;
$$;

-- Create demo admin users (these would need to be created via Supabase Auth API in production)
-- For now, we'll create the profile entries that can be linked to auth.users later

-- Note: In production, you would:
-- 1. Use Supabase Admin API to create users in auth.users
-- 2. Then link them to these profiles using the returned user IDs
-- 3. The functions above are helpers for that process

-- Create placeholder entries for demo purposes
-- These will need to be properly linked to auth.users entries created via Supabase Auth

-- Demo Super Admin
DO $$
DECLARE
  super_admin_id UUID;
BEGIN
  super_admin_id := create_admin_user(
    'superadmin@mobiwave.com',
    'SuperAdmin123!',
    'super_admin',
    '+254700000001',
    'Mobiwave Innovations'
  );
  
  -- Log the created user ID for reference
  RAISE NOTICE 'Created super admin profile with ID: %', super_admin_id;
END $$;

-- Demo Admin
DO $$
DECLARE
  admin_id UUID;
BEGIN
  admin_id := create_admin_user(
    'admin@mobiwave.com',
    'Admin123!',
    'admin',
    '+254700000002',
    'Mobiwave Innovations'
  );
  
  -- Log the created user ID for reference
  RAISE NOTICE 'Created admin profile with ID: %', admin_id;
END $$;

-- Demo Regular User
DO $$
DECLARE
  demo_user_id UUID;
BEGIN
  demo_user_id := create_demo_user(
    'demo@mobiwave.com',
    'Demo123!',
    'Demo',
    'User'
  );
  
  -- Log the created user ID for reference
  RAISE NOTICE 'Created demo user profile with ID: %', demo_user_id;
END $$;

-- Create a view to help identify users that need auth.users entries
CREATE OR REPLACE VIEW admin_users_needing_auth AS
SELECT 
  ap.user_id,
  'admin' as user_type,
  ap.role,
  ap.phone,
  ap.company,
  ap.created_at
FROM admin_profiles ap
LEFT JOIN auth.users au ON ap.user_id = au.id
WHERE au.id IS NULL;

CREATE OR REPLACE VIEW demo_users_needing_auth AS
SELECT 
  p.id as user_id,
  'regular' as user_type,
  p.role,
  p.first_name,
  p.last_name,
  p.created_at
FROM profiles p
LEFT JOIN auth.users au ON p.id = au.id
WHERE au.id IS NULL AND p.role = 'user';

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION create_admin_user TO authenticated;
GRANT EXECUTE ON FUNCTION create_demo_user TO authenticated;
GRANT SELECT ON admin_users_needing_auth TO authenticated;
GRANT SELECT ON demo_users_needing_auth TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION create_admin_user IS 'Creates admin profile entries. Auth users must be created separately via Supabase Auth API.';
COMMENT ON FUNCTION create_demo_user IS 'Creates demo user profile entries. Auth users must be created separately via Supabase Auth API.';
COMMENT ON VIEW admin_users_needing_auth IS 'Shows admin profiles that need corresponding auth.users entries';
COMMENT ON VIEW demo_users_needing_auth IS 'Shows demo user profiles that need corresponding auth.users entries';