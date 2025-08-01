-- Create Supabase auth users for existing client profiles
-- This will allow client profiles to have proper Supabase sessions

DO $$
DECLARE
    client_rec RECORD;
    new_user_id UUID;
BEGIN
    -- Loop through all client profiles that don't have corresponding auth users
    FOR client_rec IN 
        SELECT cp.user_id, cp.email, cp.client_name, cp.password_hash
        FROM client_profiles cp
        WHERE cp.user_id NOT IN (
            SELECT auth.users.id 
            FROM auth.users 
            WHERE auth.users.email = cp.email
        )
    LOOP
        -- Create auth user record manually
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            created_at,
            updated_at,
            confirmation_token,
            recovery_token,
            email_change_token_new,
            email_change,
            raw_user_meta_data,
            is_super_admin,
            confirmation_sent_at,
            recovery_sent_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            client_rec.user_id,
            'authenticated',
            'authenticated',
            client_rec.email,
            crypt(decode(client_rec.password_hash, 'base64')::text, gen_salt('bf')),
            NOW(),
            NOW(), 
            NOW(),
            '',
            '',
            '',
            '',
            jsonb_build_object(
                'client_name', client_rec.client_name,
                'role', 'user',
                'user_type', 'client'
            ),
            false,
            NOW(),
            NOW()
        );
        
        RAISE NOTICE 'Created auth user for client: %', client_rec.email;
    END LOOP;
END $$;