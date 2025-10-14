import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'nodejs';

// Helper to get client IP
function getClientIP(request: NextRequest): string {
  return request.headers.get('x-forwarded-for') ||
         request.headers.get('x-real-ip') ||
         'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const userIP = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    console.log('🆕 Initializing new case...');

    // Create new case
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .insert({
        status: 'submitted',
        user_ip: userIP,
        user_agent: userAgent
      })
      .select('case_id')
      .single();

    if (caseError) {
      console.error('Database error:', caseError);
      return NextResponse.json(
        { error: 'Failed to create case' },
        { status: 500 }
      );
    }

    const caseId = caseData.case_id;
    console.log(`✅ Case created: ${caseId}`);

    return NextResponse.json({
      success: true,
      caseId: caseId,
      message: 'Case initialized successfully'
    });

  } catch (error) {
    console.error('❌ Case initialization failed:', error);
    return NextResponse.json(
      {
        error: 'Case initialization failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
