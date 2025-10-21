import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { threadId, email, action = 'save' } = body

    if (!threadId) {
      return NextResponse.json(
        { error: 'Thread ID is required' },
        { status: 400 }
      )
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Valid email address is required' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (action === 'save') {
      // Save session and send magic link

      // Generate a unique token
      const token = crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + 24) // 24-hour expiry

      // Store session data
      const { error: insertError } = await supabase
        .from('thread_sessions')
        .insert({
          thread_id: threadId,
          email,
          token,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString()
        })

      if (insertError) {
        console.error('Database error:', insertError)
        return NextResponse.json(
          { error: 'Failed to save session' },
          { status: 500 }
        )
      }

      // Generate magic link
      const baseUrl = request.nextUrl.origin
      const magicLink = `${baseUrl}/t/${threadId}?token=${token}`

      // Send email with magic link (if email service is configured)
      const sendGridApiKey = process.env.SENDGRID_API_KEY
      if (sendGridApiKey) {
        try {
          const sgMail = eval('require')('@sendgrid/mail')
          sgMail.setApiKey(sendGridApiKey)

          const msg = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL || 'noreply@mywyng.co',
            subject: 'Your Wyng Conversation Link',
            text: `Click this link to continue your conversation: ${magicLink}\n\nThis link will expire in 24 hours.`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">Your Wyng Conversation</h2>
                <p>Click the link below to continue your conversation:</p>
                <a href="${magicLink}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Continue Conversation</a>
                <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
                <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
                <p style="color: #999; font-size: 12px;">
                  Wyng - Your Healthcare Guardian Angel<br>
                  This is an automated message. Do not reply to this email.
                </p>
              </div>
            `
          }

          await sgMail.send(msg)

          return NextResponse.json({
            success: true,
            message: 'Magic link sent to your email',
            threadId,
            email,
            expiresAt: expiresAt.toISOString()
          })

        } catch (emailError) {
          console.error('Email error:', emailError)

          // Still return success with the link, even if email fails
          return NextResponse.json({
            success: true,
            message: 'Session saved successfully',
            magicLink, // Return link directly if email fails
            threadId,
            email,
            expiresAt: expiresAt.toISOString(),
            warning: 'Email service unavailable - please save this link'
          })
        }
      } else {
        // No email service configured, return link directly
        return NextResponse.json({
          success: true,
          message: 'Session saved successfully',
          magicLink,
          threadId,
          email,
          expiresAt: expiresAt.toISOString(),
          note: 'Please save this link to continue your conversation later'
        })
      }

    } else if (action === 'verify') {
      // Verify magic link token
      const { token } = body

      if (!token) {
        return NextResponse.json(
          { error: 'Token is required for verification' },
          { status: 400 }
        )
      }

      const { data: session, error: selectError } = await supabase
        .from('thread_sessions')
        .select('*')
        .eq('thread_id', threadId)
        .eq('token', token)
        .eq('email', email)
        .single()

      if (selectError || !session) {
        return NextResponse.json(
          { error: 'Invalid or expired session link' },
          { status: 404 }
        )
      }

      // Check if token is expired
      const expiresAt = new Date(session.expires_at)
      if (expiresAt < new Date()) {
        return NextResponse.json(
          { error: 'Session link has expired' },
          { status: 410 }
        )
      }

      // Update last accessed
      await supabase
        .from('thread_sessions')
        .update({ last_accessed: new Date().toISOString() })
        .eq('id', session.id)

      return NextResponse.json({
        success: true,
        valid: true,
        threadId,
        email,
        createdAt: session.created_at,
        expiresAt: session.expires_at
      })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )

  } catch (error) {
    console.error('Magic link error:', error)

    return NextResponse.json(
      {
        error: 'Session management failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const threadId = searchParams.get('threadId')
    const token = searchParams.get('token')

    if (!threadId || !token) {
      return NextResponse.json(
        { error: 'Thread ID and token are required' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: session, error } = await supabase
      .from('thread_sessions')
      .select('*')
      .eq('thread_id', threadId)
      .eq('token', token)
      .single()

    if (error || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Check if token is expired
    const expiresAt = new Date(session.expires_at)
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Session has expired' },
        { status: 410 }
      )
    }

    return NextResponse.json({
      success: true,
      threadId: session.thread_id,
      email: session.email,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
      lastAccessed: session.last_accessed
    })

  } catch (error) {
    console.error('Session verification error:', error)

    return NextResponse.json(
      {
        error: 'Session verification failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}