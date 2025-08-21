-- Fix the search path for the create_profile_for_client function
CREATE OR REPLACE FUNCTION public.create_profile_for_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
    full_name = EXCLUDED.full_name,
    role = 'user',
    user_type = 'client';
  
  RETURN NEW;
END;
$$;