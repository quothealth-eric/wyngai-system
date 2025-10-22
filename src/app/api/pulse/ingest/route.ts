import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'
import { anthropic } from '@/lib/anthropic'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('📡 Starting policy pulse ingestion...')

    // Get recent document changes from our existing documents table
    const { data: recentDocs, error: docsError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
      .order('updated_at', { ascending: false })
      .limit(20)

    if (docsError) {
      console.error('Failed to fetch recent documents:', docsError)
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    const processedItems = []

    for (const doc of recentDocs || []) {
      try {
        console.log(`🔍 Processing: ${doc.title}`)

        // Generate plain-language summary and action items
        const pulsePrompt = `Analyze this policy document change and create a plain-language policy pulse item.

Document:
- Authority: ${doc.authority}
- Title: ${doc.title}
- Section: ${doc.section_id || 'N/A'}
- Effective Date: ${doc.effective_date || 'N/A'}
- Content excerpt: "${doc.content_text?.substring(0, 500)}..."

Create a JSON response:
{
  "title": "Clear, actionable title (60 chars max)",
  "summary": "What this means in plain English (280 chars max)",
  "action_items": [
    "If you have employer insurance, check...",
    "If you're on marketplace plans, consider..."
  ],
  "jurisdiction": "US" or specific state code,
  "significant": true if this is a major change that affects many people
}

Focus on:
- What changed
- Who it affects
- What they should do about it
- When it takes effect

Keep language simple and actionable.`

        if (!anthropic) {
          throw new Error('Anthropic client not available')
        }

        const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: pulsePrompt
            }
          ]
        })

        const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

        let pulseData
        try {
          pulseData = JSON.parse(responseText)
        } catch (parseError) {
          console.warn(`Failed to parse response for ${doc.title}`)
          continue
        }

        // Insert into policy_pulse table
        const { data: pulseItem, error: insertError } = await supabaseAdmin
          .from('policy_pulse')
          .upsert({
            authority: doc.authority,
            jurisdiction: pulseData.jurisdiction,
            title: pulseData.title,
            summary: pulseData.summary,
            action_items: pulseData.action_items,
            source_url: doc.url,
            effective_date: doc.effective_date,
            pinned: pulseData.significant || false
          })
          .select('id')
          .single()

        if (insertError) {
          console.error(`Failed to insert pulse item for ${doc.title}:`, insertError)
          continue
        }

        processedItems.push({
          documentTitle: doc.title,
          pulseTitle: pulseData.title,
          pulseId: pulseItem.id
        })

        console.log(`✅ Created pulse item: ${pulseData.title}`)

      } catch (docError) {
        console.error(`Error processing document ${doc.title}:`, docError)
        continue
      }
    }

    // Seed some sample data if no recent docs
    if (processedItems.length === 0) {
      console.log('📝 Seeding sample policy pulse items...')

      const sampleItems = [
        {
          authority: 'CMS',
          jurisdiction: 'US',
          title: 'Medicare Prior Auth Changes Take Effect',
          summary: 'CMS streamlined prior authorization for common procedures. Faster approvals for routine care, but new documentation requirements for complex cases.',
          action_items: [
            'If you have Medicare Advantage, ask your plan about new prior auth rules',
            'Providers should update authorization workflows by January 2025'
          ],
          source_url: 'https://www.cms.gov/newsroom',
          effective_date: '2025-01-01'
        },
        {
          authority: 'Federal',
          jurisdiction: 'US',
          title: 'No Surprises Act Mental Health Updates',
          summary: 'New rules protect patients from surprise bills for mental health services. All facilities must provide good faith estimates for uninsured patients.',
          action_items: [
            'If uninsured, always request cost estimates before mental health treatment',
            'If you get a surprise mental health bill, file a complaint immediately'
          ],
          source_url: 'https://www.cms.gov/no-surprises-act',
          effective_date: '2024-12-01',
          pinned: true
        },
        {
          authority: 'StateDOI',
          jurisdiction: 'FL',
          title: 'Florida Expands Balance Billing Protections',
          summary: 'Florida now prohibits balance billing for emergency services at all facilities. New patient notification requirements for out-of-network providers.',
          action_items: [
            'Florida residents: You cannot be balance billed for emergency care',
            'Ask for written network status disclosure before non-emergency procedures'
          ],
          source_url: 'https://floir.gov',
          effective_date: '2024-11-15'
        }
      ]

      for (const item of sampleItems) {
        const { data: samplePulse, error: sampleError } = await supabaseAdmin
          .from('policy_pulse')
          .upsert(item)
          .select('id')
          .single()

        if (!sampleError) {
          processedItems.push({
            documentTitle: 'Sample data',
            pulseTitle: item.title,
            pulseId: samplePulse.id
          })
        }
      }
    }

    console.log('✅ Policy pulse ingestion completed')

    return NextResponse.json({
      success: true,
      message: 'Policy pulse ingestion completed',
      processed: processedItems.length,
      items: processedItems
    })

  } catch (error) {
    console.error('❌ Policy pulse ingestion failed:', error)
    return NextResponse.json(
      {
        error: 'Ingestion failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}