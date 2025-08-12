-- Fix client authentication function
-- This ensures the authenticate_client_profile function exists and works correctly

-- Drop any existing version of the function
DROP FUNCTION IF EXISTS public.authenticate_client_profile(text, text);

-- Create the authenticate_client_profile function
CREATE OR REPLACE FUNCTION public.authenticate_client_profile(login_identifier text, login_password text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  client_name character varying(255),
  username character varying(100),
  email character varying(255),
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Simple password validation using encode for base64 comparison
  RETURN QUERY
  SELECT 
    cp.id,
    cp.user_id,
    cp.client_name,
    cp.username,
    cp.email,
    cp.is_active
  FROM client_profiles cp
  WHERE (cp.email = login_identifier OR cp.username = login_identifier)
    AND cp.password_hash = encode(login_password::bytea, 'base64')
    AND cp.is_active = true;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.authenticate_client_profile(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.authenticate_client_profile(text, text) TO authenticated;

-- Ensure client_profiles table exists with proper structure
CREATE TABLE IF NOT EXISTS public.client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name VARCHAR(255) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  sms_balance INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_login TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS on client_profiles if not already enabled
ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;

-- Create or replace policies for client_profiles
DROP POLICY IF EXISTS "Users can manage their own client profiles" ON public.client_profiles;
CREATE POLICY "Users can manage their own client profiles"
ON public.client_profiles
FOR ALL
USING (auth.uid() = user_id);

-- Add policy for public access during authentication
DROP POLICY IF EXISTS "Public can authenticate client profiles" ON public.client_profiles;
CREATE POLICY "Public can authenticate client profiles"
ON public.client_profiles
FOR SELECT
TO anon
USING (true);

-- Insert a test client profile if none exists (for testing)
-- Password "password123" encoded as base64
INSERT INTO public.client_profiles (
  user_id, 
  client_name, 
  username, 
  password_hash, 
  email, 
  is_active
) 
SELECT 
  (SELECT id FROM auth.users LIMIT 1), -- Use first available user_id or create a dummy one
  'Test Client',
  'testclient',
  encode('password123'::bytea, 'base64'),
  'test@client.com',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.client_profiles WHERE username = 'testclient');

-- If no auth users exist, create a dummy UUID for testing
DO $$
DECLARE
  dummy_user_id UUID;
BEGIN
  -- Check if there are any auth users
  IF NOT EXISTS (SELECT 1 FROM auth.users LIMIT 1) THEN
    -- Create a dummy user_id for testing
    dummy_user_id := gen_random_uuid();
    
    -- Update the test client profile with dummy user_id
    UPDATE public.client_profiles 
    SET user_id = dummy_user_id 
    WHERE username = 'testclient' AND user_id IS NULL;
  END IF;
END;
$$;