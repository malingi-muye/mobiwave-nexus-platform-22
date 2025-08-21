-- First, check and remove any duplicate policies
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Drop all existing policies on api_credentials table
    FOR policy_record IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE tablename = 'api_credentials' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
                      policy_record.policyname, 
                      policy_record.schemaname, 
                      policy_record.tablename);
    END LOOP;
END $$;

-- Create clean, non-conflicting RLS policies for api_credentials table

-- Users can manage their own credentials
CREATE POLICY "Users can manage their own credentials" 
ON public.api_credentials 
FOR ALL 
USING (auth.uid() = user_id);

-- Admins can view all API credentials
CREATE POLICY "Admins can view all API credentials" 
ON public.api_credentials 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  )
);

-- Admins can insert API credentials for any user
CREATE POLICY "Admins can insert API credentials for any user" 
ON public.api_credentials 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  )
);

-- Admins can update any API credentials
CREATE POLICY "Admins can update any API credentials" 
ON public.api_credentials 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  )
);

-- Admins can delete any API credentials
CREATE POLICY "Admins can delete any API credentials" 
ON public.api_credentials 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  )
);