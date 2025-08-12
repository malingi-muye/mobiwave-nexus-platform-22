-- Create RLS policies for api_credentials table

-- Allow users to view their own API credentials
CREATE POLICY "Users can view their own API credentials" 
ON public.api_credentials 
FOR SELECT 
USING (auth.uid() = user_id);

-- Allow admins to view all API credentials
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

-- Allow users to insert their own API credentials
CREATE POLICY "Users can insert their own API credentials" 
ON public.api_credentials 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Allow admins to insert API credentials for any user
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

-- Allow users to update their own API credentials
CREATE POLICY "Users can update their own API credentials" 
ON public.api_credentials 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Allow admins to update any API credentials
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

-- Allow users to delete their own API credentials
CREATE POLICY "Users can delete their own API credentials" 
ON public.api_credentials 
FOR DELETE 
USING (auth.uid() = user_id);

-- Allow admins to delete any API credentials
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