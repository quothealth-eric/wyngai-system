const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('Creating users table...');

    // Create users table
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.users (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          email text UNIQUE NOT NULL,
          password_hash text NOT NULL,
          email_verified boolean DEFAULT false,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now(),
          last_login_at timestamptz
        );
      `
    });

    if (error) {
      console.error('Error creating users table:', error);
    } else {
      console.log('Users table created successfully');
    }

    // Create user_sessions table
    console.log('Creating user_sessions table...');
    const { error: sessionsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.user_sessions (
          session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
          session_token text UNIQUE NOT NULL,
          expires_at timestamptz NOT NULL,
          created_at timestamptz DEFAULT now(),
          last_active_at timestamptz DEFAULT now()
        );
      `
    });

    if (sessionsError) {
      console.error('Error creating user_sessions table:', sessionsError);
    } else {
      console.log('User sessions table created successfully');
    }

    // Create analytics_events table
    console.log('Creating analytics_events table...');
    const { error: analyticsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.analytics_events (
          event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
          event_name text NOT NULL,
          event_params jsonb,
          created_at timestamptz DEFAULT now()
        );
      `
    });

    if (analyticsError) {
      console.error('Error creating analytics_events table:', analyticsError);
    } else {
      console.log('Analytics events table created successfully');
    }

    console.log('Migration completed!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();