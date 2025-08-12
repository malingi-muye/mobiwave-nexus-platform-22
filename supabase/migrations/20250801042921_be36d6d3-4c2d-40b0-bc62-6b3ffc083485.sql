-- Create a function to automatically create a profile entry for client profiles
CREATE OR REPLACE FUNCTION public.create_profile_for_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert a corresponding profile entry for the client
  INSERT INTO public.profiles (id, email, full_name, role, user_type)
  VALUES (
    NEW.user_id,
    NEW.email,
    NEW.client_name,
    'user',  -- Default role for all client profiles
    'client' -- User type to distinguish from regular users
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.client_name,
    role = 'user',
    user_type = 'client';
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically create profile entries for client profiles
CREATE TRIGGER create_profile_for_client_trigger
  AFTER INSERT OR UPDATE ON client_profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_for_client();

-- Update existing client profiles to have corresponding profile entries
INSERT INTO public.profiles (id, email, full_name, role, user_type)
SELECT 
  cp.user_id,
  cp.email,
  cp.client_name,
  'user',
  'client'
FROM client_profiles cp
WHERE cp.user_id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.client_name,
  role = 'user',
  user_type = 'client';