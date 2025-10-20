import { NextRequest, NextResponse } from 'next/server';

// Conditional import for Twilio to avoid build issues
let Twilio: any = null;
try {
  Twilio = require('twilio').Twilio;
} catch (e) {
  console.warn('Twilio not installed - SMS functionality disabled');
}

// Initialize Twilio
let twilioClient: any = null;
if (Twilio && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = new Twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
}

export async function POST(request: NextRequest) {
  try {
    const { to, content, shareId } = await request.json();

    if (!to || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: to, content' },
        { status: 400 }
      );
    }

    if (!twilioClient) {
      return NextResponse.json(
        { error: 'SMS service not configured' },
        { status: 503 }
      );
    }

    // Create SMS content
    const smsContent = generateSMSContent(content, shareId);

    const message = await twilioClient.messages.create({
      body: smsContent,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });

    // Log the share action
    console.log('📱 SMS shared:', { to, shareId, messageSid: message.sid });

    return NextResponse.json({
      success: true,
      message: 'SMS sent successfully',
      messageSid: message.sid
    });

  } catch (error) {
    console.error('Error sending SMS:', error);
    return NextResponse.json(
      { error: 'Failed to send SMS' },
      { status: 500 }
    );
  }
}

function generateSMSContent(content: any, shareId?: string): string {
  let sms = `Wyng Healthcare Assistant\n\n`;

  if (content.question) {
    sms += `Q: ${content.question}\n\n`;
  }

  // Truncate answer for SMS
  const answer = content.answer || content.summary || 'Analysis complete';
  const truncatedAnswer = answer.length > 300 ? answer.substring(0, 297) + '...' : answer;
  sms += `A: ${truncatedAnswer}\n\n`;

  if (content.potential_savings) {
    sms += `💰 Potential Savings: $${content.potential_savings}\n\n`;
  }

  if (content.nextSteps && content.nextSteps.length > 0) {
    sms += `Next Steps:\n`;
    content.nextSteps.slice(0, 2).forEach((step: string, index: number) => {
      const truncatedStep = step.length > 80 ? step.substring(0, 77) + '...' : step;
      sms += `${index + 1}. ${truncatedStep}\n`;
    });
    sms += '\n';
  }

  if (shareId) {
    sms += `View full details: ${process.env.NEXT_PUBLIC_BASE_URL}/share/${shareId}\n\n`;
  }

  sms += `From Wyng - Your Healthcare Guardian Angel\nNot medical/legal advice. Verify with providers.`;

  // SMS has a 1600 character limit, ensure we stay within it
  if (sms.length > 1500) {
    sms = sms.substring(0, 1497) + '...';
  }

  return sms;
}