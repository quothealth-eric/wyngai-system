import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { donationSchema } from '@/lib/validations'
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable')
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validatedData = donationSchema.parse(body)
    const { amount, email } = validatedData

    // Convert amount to cents for Stripe
    const amountCents = Math.round(amount * 100)

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Wyng Lite Donation',
              description: 'Thank you for supporting Wyng Lite development!',
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/chat`,
      customer_email: email || undefined,
      metadata: {
        source: 'wyng_lite_donation',
        amount_dollars: amount.toString(),
      },
    })

    // Save donation record to database (pending status)
    const { data: donationData, error: dbError } = await supabase
      .from('donations')
      .insert({
        stripe_session_id: session.id,
        amount_cents: amountCents,
        currency: 'usd',
        status: 'pending',
      })
      .select()
      .single()

    if (dbError) {
      console.error('Error creating donation record:', dbError)
      // Continue anyway - the donation can be tracked via Stripe webhooks
    }

    // Return the checkout URL
    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    })

  } catch (error: any) {
    console.error('Donation API error:', error);

    // Handle validation errors
    if (error.errors) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: error.errors
        },
        { status: 400 }
      );
    }

    // Handle Stripe-specific errors
    if (error.type) {
      console.error('Stripe error:', error);
      return NextResponse.json(
        { error: 'Payment processing error' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET route for redirecting to Stripe Checkout (fallback)
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const amount = url.searchParams.get('amount')

  if (!amount || isNaN(parseFloat(amount))) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/chat?error=invalid_amount`)
  }

  try {
    // Create a default $5 donation session for direct links
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Wyng Lite Donation',
              description: 'Thank you for supporting Wyng Lite development!',
            },
            unit_amount: Math.round(parseFloat(amount) * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/chat`,
      metadata: {
        source: 'wyng_lite_donation',
        amount_dollars: amount,
      },
    })

    return NextResponse.redirect(session.url!)

  } catch (error) {
    console.error('Error creating donation session:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/chat?error=payment_error`)
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}