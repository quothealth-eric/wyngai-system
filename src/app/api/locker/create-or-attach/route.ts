import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Creating or attaching to Case Locker...')

    const body = await request.json()
    const { email, threadId } = body

    if (!email) {
      return NextResponse.json(
        { error: 'email is required' },
        { status: 400 }
      )
    }

    // Check if user already has a locker
    const { data: existingLocker, error: lookupError } = await supabaseAdmin
      .from('case_locker')
      .select('*')
      .eq('email', email)
      .gt('token_expires_at', new Date().toISOString())
      .single()

    let locker = existingLocker

    if (lookupError && lookupError.code !== 'PGRST116') {
      console.error('Locker lookup error:', lookupError)
      return NextResponse.json(
        { error: 'Failed to lookup existing locker' },
        { status: 500 }
      )
    }

    // Create new locker if none exists or expired
    if (!locker) {
      console.log('📦 Creating new locker...')

      const magicToken = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

      const { data: newLocker, error: createError } = await supabaseAdmin
        .from('case_locker')
        .insert({
          email,
          magic_token: magicToken,
          token_expires_at: expiresAt.toISOString()
        })
        .select('*')
        .single()

      if (createError) {
        console.error('Failed to create locker:', createError)
        return NextResponse.json(
          { error: 'Failed to create locker' },
          { status: 500 }
        )
      }

      locker = newLocker
    }

    // Generate magic link
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://getwyng.co'
    const magicLink = `${baseUrl}/locker/${locker.magic_token}`

    // Send magic link email (if RESEND_API_KEY is configured)
    if (process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes('placeholder')) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)

        await resend.emails.send({
          from: 'WyngAI <noreply@getwyng.co>',
          to: [email],
          subject: 'Your MyWyng Case Locker',
          html: `
            <h2>Your MyWyng Case Locker</h2>
            <p>Access your saved conversations and reports:</p>
            <p><a href="${magicLink}" style="background: #29CC96; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Open My Locker</a></p>
            <p>This link expires in 30 days.</p>
            <hr>
            <p style="color: #666; font-size: 12px;">This email was sent because you requested access to your MyWyng Case Locker. If you didn't request this, you can safely ignore this email.</p>
          `,
          text: `Your MyWyng Case Locker\n\nAccess your saved conversations and reports: ${magicLink}\n\nThis link expires in 30 days.`
        })

        console.log('📧 Magic link email sent')
      } catch (emailError) {
        console.warn('Failed to send magic link email:', emailError)
        // Continue without failing - user can still use the returned link
      }
    }

    console.log('✅ Locker ready')

    return NextResponse.json({
      success: true,
      lockerId: locker.locker_id,
      email: locker.email,
      magicLink,
      expiresAt: locker.token_expires_at,
      isNewLocker: !existingLocker,
      threadId
    })

  } catch (error) {
    console.error('❌ Locker creation failed:', error)
    return NextResponse.json(
      {
        error: 'Locker creation failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}