-- Update authenticate_client_profile to use bcrypt for password verification
-- Ensure pgcrypto is available for crypt()/bcrypt support
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  AND crypt(login_password::text, cp.password_hash::text) = cp.password_hash::text
    AND cp.is_active = true;
END;
$$;
