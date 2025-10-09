import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { leadSchema } from '@/lib/validations'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validatedData = leadSchema.parse(body)
    const { email, name, phone, isInvestor } = validatedData

    // Ensure email is provided
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Check if lead already exists
    const { data: existingLead, error: checkError } = await supabase
      .from('leads')
      .select('id, name, phone, is_investor')
      .eq('email', email)
      .single()

    let leadData

    if (existingLead) {
      // Update existing lead (mainly to update investor status)
      const { data: updatedLead, error: updateError } = await supabase
        .from('leads')
        .update({
          name: name || existingLead.name,
          phone: phone || existingLead.phone,
          is_investor: isInvestor || existingLead.is_investor,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingLead.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating lead:', updateError)
        return NextResponse.json(
          { error: 'Failed to update lead information' },
          { status: 500 }
        )
      }

      leadData = updatedLead
    } else {
      // Create new lead
      const { data: newLead, error: insertError } = await supabase
        .from('leads')
        .insert({
          email,
          name: name || null,
          phone: phone || null,
          is_investor: isInvestor,
          opted_in_at: new Date().toISOString()
        })
        .select()
        .single()

      if (insertError) {
        console.error('Error creating lead:', insertError)

        if (insertError.code === '23505') { // Unique constraint violation
          return NextResponse.json(
            { error: 'Email already registered' },
            { status: 409 }
          )
        }

        return NextResponse.json(
          { error: 'Failed to register email' },
          { status: 500 }
        )
      }

      leadData = newLead
    }

    // Send welcome email if this is a new lead or if we haven't sent one
    if (!existingLead && process.env.RESEND_API_KEY) {
      try {
        await resend.emails.send({
          from: 'Wyng Lite <noreply@yourdomain.com>', // Replace with your domain
          to: email,
          subject: 'Welcome to Wyng Lite - Your Healthcare Guardian Angel',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">Welcome to Wyng Lite!</h2>

              <p>Hi${name ? ` ${name}` : ''},</p>

              <p>Thank you for joining our community! You'll now receive updates about:</p>

              <ul>
                <li>New features and improvements to Wyng Lite</li>
                <li>Healthcare billing tips and guidance</li>
                <li>Important updates about healthcare laws and policies</li>
                ${isInvestor ? '<li>Investment opportunities and company updates</li>' : ''}
              </ul>

              <p>In the meantime, feel free to continue using Wyng Lite to get help with your medical bills and insurance questions.</p>

              <p>Questions? Just reply to this email.</p>

              <p>Best,<br>The Wyng Team</p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">

              <p style="font-size: 12px; color: #666;">
                You're receiving this email because you signed up for updates from Wyng Lite.
                You can unsubscribe at any time by clicking
                <a href="mailto:noreply@yourdomain.com?subject=Unsubscribe">here</a>.
              </p>
            </div>
          `
        })
      } catch (emailError) {
        console.error('Error sending welcome email:', emailError)
        // Don't fail the request if email sending fails
      }
    }

    return NextResponse.json({
      id: leadData.id,
      email: leadData.email,
      name: leadData.name,
      isInvestor: leadData.is_investor,
      message: existingLead ? 'Information updated successfully' : 'Successfully joined our list'
    })

  } catch (error: any) {
    console.error('Lead API error:', error);

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

    return NextResponse.json(
      { error: 'Internal server error' },
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
  })
}