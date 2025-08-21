/**
 * Setup Demo Users Script
 * 
 * This script creates demo users in Supabase Auth and links them to the appropriate profiles.
 * Run this script after running the database migration to create the profile entries.
 * 
 * Usage:
 * node scripts/setup-demo-users.js
 * 
 * Make sure to set the following environment variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('- SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create Supabase client with service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const demoUsers = [
  {
    email: 'superadmin@mobiwave.com',
    password: 'SuperAdmin123!',
    type: 'admin',
    role: 'super_admin',
    metadata: {
      phone: '+254700000001',
      company: 'Mobiwave Innovations',
      role: 'super_admin'
    }
  },
  {
    email: 'admin@mobiwave.com',
    password: 'Admin123!',
    type: 'admin',
    role: 'admin',
    metadata: {
      phone: '+254700000002',
      company: 'Mobiwave Innovations',
      role: 'admin'
    }
  },
  {
    email: 'demo@mobiwave.com',
    password: 'Demo123!',
    type: 'regular',
    role: 'user',
    metadata: {
      first_name: 'Demo',
      last_name: 'User',
      role: 'user'
    }
  }
];

async function createDemoUser(userConfig) {
  try {
    console.log(`Creating user: ${userConfig.email}`);
    
    // Create user in auth.users
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: userConfig.email,
      password: userConfig.password,
      email_confirm: true, // Auto-confirm email
      user_metadata: userConfig.metadata
    });

    if (authError) {
      console.error(`Error creating auth user for ${userConfig.email}:`, authError);
      return null;
    }

    console.log(`✓ Created auth user: ${authUser.user.id}`);

    // Link to profiles table for all users (admins and regular)
    const { error: profileUpsertError } = await supabase
      .from('profiles')
      .upsert({
        id: authUser.user.id,
        role: userConfig.role,
        first_name: userConfig.metadata.first_name || null,
        last_name: userConfig.metadata.last_name || null
      }, { onConflict: 'id' });

    if (profileUpsertError) {
      console.error(`Error upserting profile for ${userConfig.email}:`, profileUpsertError);
      return null;
    }

    // Optionally ensure admin settings/preferences rows exist for admins (no admin_profiles)
    if (userConfig.type === 'admin') {
      await supabase
        .from('admin_security_settings')
        .upsert({ user_id: authUser.user.id }, { onConflict: 'user_id' });

      await supabase
        .from('admin_preferences')
        .upsert({ user_id: authUser.user.id }, { onConflict: 'user_id' });

      console.log(`✓ Linked admin user (profiles) for ${userConfig.email}`);
    } else {
      console.log(`✓ Linked regular user (profiles) for ${userConfig.email}`);
    }

    return authUser.user;
  } catch (error) {
    console.error(`Unexpected error creating user ${userConfig.email}:`, error);
    return null;
  }
}

async function setupDemoUsers() {
  console.log('Setting up demo users...\n');

  const results = [];
  
  for (const userConfig of demoUsers) {
    const user = await createDemoUser(userConfig);
    results.push({ config: userConfig, user });
    console.log(''); // Add spacing between users
  }

  console.log('Demo user setup complete!\n');
  console.log('Summary:');
  results.forEach(({ config, user }) => {
    if (user) {
      console.log(`✓ ${config.email} (${config.role}) - ID: ${user.id}`);
    } else {
      console.log(`✗ ${config.email} (${config.role}) - Failed`);
    }
  });

  console.log('\nYou can now use these credentials to test the separate login system:');
  console.log('- Super Admin: superadmin@mobiwave.com / SuperAdmin123!');
  console.log('- Admin: admin@mobiwave.com / Admin123!');
  console.log('- Demo User: demo@mobiwave.com / Demo123!');
}

// Run the setup
setupDemoUsers().catch(console.error);