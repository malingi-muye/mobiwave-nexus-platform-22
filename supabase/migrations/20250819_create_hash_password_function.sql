-- Secure server-side password hashing using bcrypt via pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash a password with bcrypt
CREATE OR REPLACE FUNCTION public.hash_password(pwd text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  salt text;
  hashed text;
BEGIN
  salt := gen_salt('bf');
  hashed := crypt(pwd, salt);
  RETURN hashed;
END;
$$;

-- Optional: validation helper for checking a plaintext password against a bcrypt hash
CREATE OR REPLACE FUNCTION public.verify_password(pwd text, hashed text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT crypt(pwd, hashed) = hashed;
$$;