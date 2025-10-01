import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable')
}

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn('Missing STRIPE_WEBHOOK_SECRET - webhooks will not be verified')
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
})

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event: Stripe.Event

  try {
    if (process.env.STRIPE_WEBHOOK_SECRET && signature) {
      // Verify the webhook signature
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      )
    } else {
      // In development or if webhook secret not configured, parse without verification
      console.warn('Processing webhook without signature verification')
      event = JSON.parse(body) as Stripe.Event
    }
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    )
  }

  console.log('Processing webhook event:', event.type)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        console.log('Checkout session completed:', session.id)

        // Update donation record in database
        const { error: updateError } = await supabase
          .from('donations')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('stripe_session_id', session.id)

        if (updateError) {
          console.error('Error updating donation:', updateError)
          // Don't fail the webhook - we can reconcile later
        }

        // If customer email exists, check/create lead record
        if (session.customer_email) {
          const { data: existingLead } = await supabase
            .from('leads')
            .select('id')
            .eq('email', session.customer_email)
            .single()

          if (!existingLead) {
            const { error: leadError } = await supabase
              .from('leads')
              .insert({
                email: session.customer_email,
                name: session.customer_details?.name || null,
                is_investor: false,
                opted_in_at: new Date().toISOString(),
              })

            if (leadError) {
              console.error('Error creating lead:', leadError)
            }
          }
        }

        break
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session

        // Mark donation as expired
        await supabase
          .from('donations')
          .update({
            status: 'expired',
          })
          .eq('stripe_session_id', session.id)

        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('Payment succeeded:', paymentIntent.id, 'Amount:', paymentIntent.amount)
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.error('Payment failed:', paymentIntent.id)

        // You could update donation status to 'failed' if tracking by payment_intent_id
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('Webhook processing error:', error)
    // Return success to Stripe even if processing failed
    // We don't want Stripe to keep retrying if there's an app error
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}

// Stripe webhooks must be POST only
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}