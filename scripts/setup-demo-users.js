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

    // Link to appropriate profile table
    if (userConfig.type === 'admin') {
      // Update admin_profiles with the auth user ID
      const { error: profileError } = await supabase
        .from('admin_profiles')
        .update({ user_id: authUser.user.id })
        .eq('role', userConfig.role)
        .eq('phone', userConfig.metadata.phone);

      if (profileError) {
        console.error(`Error linking admin profile for ${userConfig.email}:`, profileError);
        return null;
      }

      // Update admin_security_settings
      await supabase
        .from('admin_security_settings')
        .update({ user_id: authUser.user.id })
        .eq('user_id', authUser.user.id);

      // Update admin_preferences
      await supabase
        .from('admin_preferences')
        .update({ user_id: authUser.user.id })
        .eq('user_id', authUser.user.id);

      console.log(`✓ Linked admin profile for ${userConfig.email}`);
    } else {
      // Update profiles table with the auth user ID
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ id: authUser.user.id })
        .eq('first_name', userConfig.metadata.first_name)
        .eq('last_name', userConfig.metadata.last_name)
        .eq('role', userConfig.role);

      if (profileError) {
        console.error(`Error linking regular profile for ${userConfig.email}:`, profileError);
        return null;
      }

      console.log(`✓ Linked regular profile for ${userConfig.email}`);
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