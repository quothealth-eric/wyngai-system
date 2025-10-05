import { NextRequest, NextResponse } from 'next/server';
import { EmailGate } from '@/lib/email-gate';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if email has been used before
    const emailGateResult = await EmailGate.checkEmailAccess(email);

    return NextResponse.json(emailGateResult);

  } catch (error) {
    console.error('Email check failed:', error);
    return NextResponse.json(
      { error: 'Failed to check email' },
      { status: 500 }
    );
  }
}