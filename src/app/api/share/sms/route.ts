import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { content, threadId, messageId, to } = body

    if (!content || !to) {
      return NextResponse.json(
        { error: 'Content and phone number are required' },
        { status: 400 }
      )
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/
    if (!phoneRegex.test(to.replace(/\s/g, ''))) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      )
    }

    // Check if Twilio is configured
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      return NextResponse.json(
        { error: 'SMS service not configured' },
        { status: 503 }
      )
    }

    // Format SMS content (SMS has character limits)
    let smsBody = ''
    const maxLength = 1600 // SMS limit

    if (typeof content === 'string') {
      smsBody = content
    } else if (content.answer) {
      // Chat response format
      smsBody = `Wyng Response: ${content.answer}`

      if (content.nextSteps && content.nextSteps.length > 0) {
        smsBody += `\n\nNext Steps:\n`
        content.nextSteps.slice(0, 3).forEach((step: string, index: number) => {
          smsBody += `${index + 1}. ${step}\n`
        })
        if (content.nextSteps.length > 3) {
          smsBody += `... and ${content.nextSteps.length - 3} more`
        }
      }
    } else if (content.summary) {
      // Bill analysis format
      smsBody = `Bill Analysis: ${content.summary}`

      if (content.savings) {
        smsBody += `\nPotential Savings: $${content.savings}`
      }

      if (content.findings && content.findings.length > 0) {
        smsBody += `\nKey Findings: ${content.findings.slice(0, 2).join(', ')}`
        if (content.findings.length > 2) {
          smsBody += ` and ${content.findings.length - 2} more`
        }
      }
    }

    // Truncate if too long
    if (smsBody.length > maxLength) {
      smsBody = smsBody.substring(0, maxLength - 50) + '... (Full report available at mywyng.co)'
    }

    // Add footer
    smsBody += '\n\nFrom Wyng - Your Healthcare Guardian Angel'

    if (threadId) {
      smsBody += `\nThread: ${threadId.slice(-8)}`
    }

    // Send SMS using Twilio
    try {
      const twilio = eval('require')('twilio')
      const client = twilio(twilioAccountSid, twilioAuthToken)

      const message = await client.messages.create({
        body: smsBody,
        from: twilioPhoneNumber,
        to: to
      })

      return NextResponse.json({
        success: true,
        message: 'SMS sent successfully',
        to,
        messageId: message.sid,
        length: smsBody.length
      })

    } catch (smsError: any) {
      console.error('Twilio error:', smsError)

      return NextResponse.json(
        {
          error: 'Failed to send SMS',
          details: smsError.message || 'SMS service error'
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('SMS export error:', error)

    return NextResponse.json(
      {
        error: 'SMS export failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'SMS export endpoint',
    methods: ['POST'],
    accepts: ['application/json'],
    requires: ['content', 'to'],
    sends: 'SMS message with conversation content',
    note: 'Content is truncated to fit SMS limits'
  })
}