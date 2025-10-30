/**
 * User Sign Out API Endpoint
 *
 * Handles user session termination
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get('session_token')?.value;

    if (sessionToken) {
      // Find and delete the session
      const { data: session } = await supabase
        .from('user_sessions')
        .select('user_id')
        .eq('session_token', sessionToken)
        .single();

      if (session) {
        // Delete the session
        await supabase
          .from('user_sessions')
          .delete()
          .eq('session_token', sessionToken);

        // Log analytics
        await supabase.from('analytics_events').insert({
          user_id: session.user_id,
          event_name: 'user_signout',
          event_params: {
            signout_at: new Date().toISOString()
          }
        });
      }
    }

    // Clear the session cookie
    const response = NextResponse.json({
      success: true,
      message: 'Signed out successfully'
    });

    response.cookies.set('session_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0
    });

    return response;

  } catch (error) {
    console.error('Signout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}