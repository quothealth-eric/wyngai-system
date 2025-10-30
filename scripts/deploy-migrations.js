#!/usr/bin/env node

/**
 * Production deployment migration script
 * Runs all necessary database migrations for the WyngAI Search platform
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Environment validation
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

async function checkTableExists(tableName) {
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName);

  return !error && data && data.length > 0;
}

async function createUsersTable() {
  const exists = await checkTableExists('users');
  if (exists) {
    console.log('✓ Users table already exists');
    return;
  }

  console.log('📝 Creating users table...');

  const { error } = await supabase.rpc('exec', {
    sql: `
      CREATE TABLE public.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        password_hash text NOT NULL,
        email_verified boolean DEFAULT false,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        last_login_at timestamptz
      );

      CREATE INDEX idx_users_email ON public.users(email);
    `
  });

  if (error) {
    console.error('❌ Failed to create users table:', error);
    throw error;
  }

  console.log('✓ Users table created successfully');
}

async function createUserSessionsTable() {
  const exists = await checkTableExists('user_sessions');
  if (exists) {
    console.log('✓ User sessions table already exists');
    return;
  }

  console.log('📝 Creating user_sessions table...');

  const { error } = await supabase.rpc('exec', {
    sql: `
      CREATE TABLE public.user_sessions (
        session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
        session_token text UNIQUE NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz DEFAULT now(),
        last_active_at timestamptz DEFAULT now()
      );

      CREATE INDEX idx_user_sessions_token ON public.user_sessions(session_token);
      CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
      CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions(expires_at);
    `
  });

  if (error) {
    console.error('❌ Failed to create user_sessions table:', error);
    throw error;
  }

  console.log('✓ User sessions table created successfully');
}

async function createAnalyticsEventsTable() {
  const exists = await checkTableExists('analytics_events');
  if (exists) {
    console.log('✓ Analytics events table already exists');
    return;
  }

  console.log('📝 Creating analytics_events table...');

  const { error } = await supabase.rpc('exec', {
    sql: `
      CREATE TABLE public.analytics_events (
        event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
        event_name text NOT NULL,
        event_params jsonb,
        created_at timestamptz DEFAULT now()
      );

      CREATE INDEX idx_analytics_events_user_id ON public.analytics_events(user_id);
      CREATE INDEX idx_analytics_events_created_at ON public.analytics_events(created_at);
      CREATE INDEX idx_analytics_events_name ON public.analytics_events(event_name);
    `
  });

  if (error) {
    console.error('❌ Failed to create analytics_events table:', error);
    throw error;
  }

  console.log('✓ Analytics events table created successfully');
}

async function enableVectorExtension() {
  console.log('📝 Enabling vector extension...');

  const { error } = await supabase.rpc('exec', {
    sql: 'CREATE EXTENSION IF NOT EXISTS "vector";'
  });

  if (error) {
    console.log('⚠️  Warning: Could not enable vector extension (may need superuser privileges)');
    console.log('This is expected on hosted Supabase instances');
  } else {
    console.log('✓ Vector extension enabled');
  }
}

async function runMigrations() {
  console.log('🚀 Starting WyngAI Search platform migrations...\n');

  try {
    // Enable extensions
    await enableVectorExtension();

    // Create core authentication tables
    await createUsersTable();
    await createUserSessionsTable();
    await createAnalyticsEventsTable();

    console.log('\n✅ All migrations completed successfully!');
    console.log('🎉 WyngAI Search platform is ready for deployment');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations
runMigrations();