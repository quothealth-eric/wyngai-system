import { NextRequest, NextResponse } from 'next/server'
import { Anthropic } from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

const CONGRESS_API_BASE = 'https://api.congress.gov/v3'
const congressApiKey = process.env.CONGRESS_API_KEY!
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function fetchFromCongressAPI(endpoint: string): Promise<any> {
  const url = `${CONGRESS_API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${congressApiKey}`

  console.log(`🌐 Fetching from Congress.gov: ${endpoint}`)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WyngAI-Healthcare-Tracker/1.0',
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Congress API error: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Congress API fetch error:', error)
    throw error
  }
}

async function fetchBillText(congress: number, billType: string, billNumber: string): Promise<string> {
  try {
    const endpoint = `/bill/${congress}/${billType}/${billNumber}/text`
    const data = await fetchFromCongressAPI(endpoint)

    if (data.textVersions && data.textVersions.length > 0) {
      const latestVersion = data.textVersions[0]
      if (latestVersion.formats && latestVersion.formats.length > 0) {
        const textFormat = latestVersion.formats.find(f => f.type === 'Formatted Text') || latestVersion.formats[0]
        if (textFormat.url) {
          // Fetch the actual bill text
          const textResponse = await fetch(textFormat.url)
          if (textResponse.ok) {
            return await textResponse.text()
          }
        }
      }
    }

    return ''
  } catch (error) {
    console.error('Failed to fetch bill text:', error)
    return ''
  }
}

async function fetchBillDetails(congress: number, billType: string, billNumber: string): Promise<any> {
  try {
    const endpoint = `/bill/${congress}/${billType}/${billNumber}`
    return await fetchFromCongressAPI(endpoint)
  } catch (error) {
    console.error('Failed to fetch bill details:', error)
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { billId: string } }
) {
  try {
    const billId = params.billId
    console.log(`📄 Fetching bill text for: ${billId}`)

    // Parse bill ID (format: "congress-type-number")
    const [congress, billType, billNumber] = billId.split('-')

    if (!congress || !billType || !billNumber) {
      return NextResponse.json(
        { error: 'Invalid bill ID format. Expected: congress-type-number' },
        { status: 400 }
      )
    }

    try {
      // Fetch bill details and text from Congress.gov
      const [billDetails, billText] = await Promise.all([
        fetchBillDetails(parseInt(congress), billType, billNumber),
        fetchBillText(parseInt(congress), billType, billNumber)
      ])

      if (!billDetails) {
        return NextResponse.json(
          { error: 'Bill not found in Congress.gov' },
          { status: 404 }
        )
      }

      const bill = billDetails.bill

      return NextResponse.json({
        success: true,
        bill_id: billId,
        title: bill.title,
        number: `${bill.type.toUpperCase()} ${bill.number}`,
        congress: bill.congress,
        chamber: bill.originChamber,
        introduced_date: bill.introducedDate,
        latest_action: bill.latestAction?.text || 'No recent action',
        latest_action_date: bill.latestAction?.actionDate,
        committees: bill.committees?.map((c: any) => c.name) || [],
        subjects: bill.subjects?.map((s: any) => s.name) || [],
        url: `https://congress.gov/bill/${bill.congress}/${bill.type}/${bill.number}`,
        full_text: billText || 'Bill text not available',
        sections: billText ? extractSections(billText) : [],
        policy_area: bill.policyArea?.name,
        sponsors: bill.sponsors?.map((s: any) => ({
          name: s.fullName,
          party: s.party,
          state: s.state
        })) || [],
        cosponsors_count: bill.cosponsors?.count || 0,
        retrieved_at: new Date().toISOString()
      })

    } catch (apiError) {
      console.error('Congress.gov API error:', apiError)
      return NextResponse.json(
        {
          error: 'Congress.gov API is currently unavailable',
          message: 'Unable to fetch bill data from Congress.gov. Please try again later.',
          bill_id: billId
        },
        { status: 503 }
      )
    }

  } catch (error) {
    console.error('Error fetching bill text:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bill text' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { billId: string } }
) {
  try {
    const billId = params.billId
    const body = await request.json()
    const { question, context } = body

    if (!question) {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      )
    }

    console.log(`💬 Processing question for bill ${billId}: "${question}"`)

    // Parse bill ID (format: "congress-type-number")
    const [congress, billType, billNumber] = billId.split('-')

    if (!congress || !billType || !billNumber) {
      return NextResponse.json(
        { error: 'Invalid bill ID format. Expected: congress-type-number' },
        { status: 400 }
      )
    }

    try {
      // Fetch bill data from Congress.gov
      const [billDetails, billText] = await Promise.all([
        fetchBillDetails(parseInt(congress), billType, billNumber),
        fetchBillText(parseInt(congress), billType, billNumber)
      ])

      if (!billDetails) {
        return NextResponse.json(
          { error: 'Bill not found in Congress.gov' },
          { status: 404 }
        )
      }

      const bill = billDetails.bill
      const fullBillText = billText || 'Bill text not available from Congress.gov'

      // Generate AI response based on real bill text
      const response = await generateBillAnalysis(
        question,
        fullBillText,
        bill.title,
        `${bill.type.toUpperCase()} ${bill.number}`,
        context
      )

      return NextResponse.json({
        success: true,
        question,
        answer: response.answer,
        citations: response.citations,
        bill_id: billId,
        bill_title: bill.title,
        bill_number: `${bill.type.toUpperCase()} ${bill.number}`,
        source: 'congress.gov',
        ai_model: 'claude-3-5-sonnet',
        timestamp: new Date().toISOString()
      })

    } catch (apiError) {
      console.error('Congress.gov API error:', apiError)
      return NextResponse.json(
        {
          error: 'Congress.gov API is currently unavailable',
          message: 'Unable to fetch bill data for analysis. Please try again later.',
          bill_id: billId
        },
        { status: 503 }
      )
    }

  } catch (error) {
    console.error('Error processing bill question:', error)
    return NextResponse.json(
      { error: 'Failed to process question' },
      { status: 500 }
    )
  }
}

function extractSections(billText: string): Array<{ section: string; title: string; content: string }> {
  const sections = []
  const lines = billText.split('\n')
  let currentSection = ''
  let currentTitle = ''
  let currentContent = ''

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Match section headers like "SEC. 101." or "SECTION 1."
    const sectionMatch = trimmedLine.match(/^(SEC\.|SECTION)\s+(\d+\w*)\.\s*(.+)/)

    if (sectionMatch) {
      // Save previous section if exists
      if (currentSection && currentContent.trim()) {
        sections.push({
          section: currentSection,
          title: currentTitle,
          content: currentContent.trim()
        })
      }

      // Start new section
      currentSection = sectionMatch[2]
      currentTitle = sectionMatch[3]
      currentContent = ''
    } else if (trimmedLine.match(/^TITLE\s+[IVX]+/)) {
      // Title headers
      if (currentSection && currentContent.trim()) {
        sections.push({
          section: currentSection,
          title: currentTitle,
          content: currentContent.trim()
        })
      }
      currentSection = ''
      currentTitle = ''
      currentContent = ''
    } else if (currentSection) {
      currentContent += line + '\n'
    }
  }

  // Add final section
  if (currentSection && currentContent.trim()) {
    sections.push({
      section: currentSection,
      title: currentTitle,
      content: currentContent.trim()
    })
  }

  return sections
}

async function generateBillAnalysis(
  question: string,
  billText: string,
  billTitle: string,
  billNumber: string,
  context?: string
): Promise<{ answer: string; citations: string[] }> {
  try {
    const prompt = `You are a neutral legislative analyst. Answer the user's question about this bill using only information from the provided bill text. Be completely non-partisan and factual.

Bill: ${billNumber} - ${billTitle}

Bill Text:
${billText.substring(0, 8000)}

User Question: ${question}

${context ? `Previous Context: ${context}` : ''}

Provide a response that:
1. Directly answers the question using only bill content
2. Includes specific citations from the bill (section numbers, exact quotes)
3. Remains completely neutral and factual
4. Uses "the bill proposes" or "according to the bill" language
5. If the bill text is not available, acknowledge this limitation

Format your response as JSON:
{
  "answer": "Your detailed answer with citations",
  "citations": ["Section 101: exact quote", "Section 201: exact quote"]
}`

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    })

    const content = response.content[0].type === 'text' ? response.content[0].text : ''
    if (!content) {
      throw new Error('No response from Anthropic')
    }

    const parsed = JSON.parse(content)
    return {
      answer: parsed.answer,
      citations: parsed.citations || []
    }
  } catch (error) {
    console.error('Failed to generate bill analysis:', error)
    return {
      answer: `I can help you understand ${billNumber} - ${billTitle}, but I'm having trouble processing your question right now. This may be due to the bill text not being available from Congress.gov or an issue with the analysis system. Please try rephrasing your question or check back later.`,
      citations: []
    }
  }
}