import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// Mock bill text data - in production this would fetch from Congress.gov
const mockBillTexts: Record<string, string> = {
  '118-hr-1': `
H.R.1 - For the People Act of 2024

SECTION 1. SHORT TITLE; TABLE OF CONTENTS.
(a) Short Title.—This Act may be cited as the "For the People Act of 2024".

TITLE I—EXPANDING ACCESS TO THE BALLOT BOX

Subtitle A—Voter Registration

SEC. 1001. AUTOMATIC VOTER REGISTRATION.
(a) Requiring Automatic Registration of Eligible Individuals.—Each State shall establish and operate a system of automatic registration whereby any eligible individual who provides information to a contributing agency (as defined in subsection (c)(2)) shall be automatically registered to vote in elections for Federal office in the State, unless the individual affirmatively declines to be registered.

TITLE VI—CAMPAIGN FINANCE REFORMS

SEC. 6001. FINDINGS.
Congress finds the following:
(1) The current system of campaign finance in the United States creates inequities in representation that may undermine public trust in government.
(2) Wealthy donors and special interests, including pharmaceutical companies, have disproportionate influence over policy-making.

TITLE VIII—ETHICS REFORMS

SEC. 8001. LOBBYING DISCLOSURE.
(a) Healthcare Industry Transparency.—Any person who engages in lobbying activities related to healthcare policy must disclose all contacts with covered officials within 24 hours.

TITLE XII—HEALTHCARE ACCESS PROVISIONS

SEC. 12001. VOTER REGISTRATION AT HEALTHCARE FACILITIES.
(a) In General.—All healthcare facilities that receive federal funding shall provide voter registration services to patients and their families.

SEC. 12002. ETHICS IN HEALTHCARE CONTRACTING.
Government healthcare contracts above $1 million shall be subject to enhanced ethics review and transparency requirements.
`,

  '118-hr-4521': `
H.R.4521 - Medicare for All Act of 2024

SECTION 1. SHORT TITLE.
This Act may be cited as the "Medicare for All Act of 2024".

SEC. 2. FINDINGS.
Congress finds the following:
(1) Healthcare is a human right.
(2) The United States spends more on healthcare per capita than any other developed nation.
(3) Administrative costs in the current system consume approximately 30% of healthcare spending.

TITLE I—ESTABLISHMENT OF MEDICARE FOR ALL PROGRAM

SEC. 101. MEDICARE FOR ALL PROGRAM.
(a) In General.—The Secretary shall establish a Medicare for All Program to provide comprehensive healthcare coverage to all individuals residing in the United States.

(b) Covered Services.—The Program shall provide coverage for:
(1) Hospital services
(2) Physician services
(3) Prescription drugs
(4) Mental health and substance abuse treatment
(5) Dental and vision care
(6) Long-term care services

SEC. 102. ELIMINATION OF COST-SHARING.
No deductibles, copayments, coinsurance, or other cost-sharing shall be imposed with respect to covered benefits.

TITLE II—FINANCING

SEC. 201. FUNDING SOURCES.
The Program shall be funded through:
(1) A progressive income tax
(2) A payroll tax on employers
(3) Existing Medicare and Medicaid funding

TITLE III—TRANSITION

SEC. 301. FOUR-YEAR TRANSITION PERIOD.
The transition to Medicare for All shall occur over a four-year period, with different populations enrolled each year.
`,

  '118-s-2187': `
S.2187 - Prescription Drug Cost Reduction Act

SECTION 1. SHORT TITLE.
This Act may be cited as the "Prescription Drug Cost Reduction Act".

TITLE I—MEDICARE PRESCRIPTION DRUG PRICING

SEC. 101. MEDICARE NEGOTIATION OF PRESCRIPTION DRUG PRICES.
(a) In General.—The Secretary of Health and Human Services shall negotiate prices for prescription drugs covered under Medicare Part D.

(b) Selection of Drugs.—The Secretary shall select for negotiation the 50 drugs with the highest total Medicare spending annually.

SEC. 102. MAXIMUM PRICE LIMITATIONS.
Negotiated prices shall not exceed 120% of the average price in comparable developed countries.

TITLE II—DRUG IMPORTATION

SEC. 201. SAFE IMPORTATION OF PRESCRIPTION DRUGS.
(a) Authorization.—The Secretary shall permit the importation of prescription drugs from approved facilities in Canada.

(b) Safety Requirements.—All imported drugs must meet FDA safety and efficacy standards.

TITLE III—TRANSPARENCY

SEC. 301. DRUG PRICING TRANSPARENCY.
Pharmaceutical manufacturers must publicly disclose:
(1) Research and development costs
(2) Manufacturing costs
(3) Marketing expenses
(4) Profit margins

TITLE IV—OUT-OF-POCKET CAPS

SEC. 401. MEDICARE PART D OUT-OF-POCKET CAP.
Out-of-pocket costs for Medicare beneficiaries shall not exceed $2,000 annually.
`
}

export async function GET(
  request: NextRequest,
  { params }: { params: { billId: string } }
) {
  try {
    const billId = params.billId

    // Mock bill text retrieval
    const billText = mockBillTexts[billId]

    if (!billText) {
      return NextResponse.json(
        { error: 'Bill text not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      bill_id: billId,
      full_text: billText.trim(),
      sections: extractSections(billText),
      retrieved_at: new Date().toISOString()
    })

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

    const billText = mockBillTexts[billId]

    if (!billText) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      )
    }

    // Generate AI response based on bill text
    const response = await generateBillAnalysis(question, billText, context)

    return NextResponse.json({
      success: true,
      question,
      answer: response.answer,
      citations: response.citations,
      bill_id: billId,
      timestamp: new Date().toISOString()
    })

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
  context?: string
): Promise<{ answer: string; citations: string[] }> {
  try {
    const prompt = `You are a neutral legislative analyst. Answer the user's question about this bill using only information from the provided bill text. Be completely non-partisan and factual.

Bill Text:
${billText.substring(0, 6000)}

User Question: ${question}

${context ? `Previous Context: ${context}` : ''}

Provide a response that:
1. Directly answers the question using only bill content
2. Includes specific citations from the bill (section numbers, exact quotes)
3. Remains completely neutral and factual
4. Uses "the bill proposes" or "according to the bill" language

Format your response as JSON:
{
  "answer": "Your detailed answer with citations",
  "citations": ["Section 101: exact quote", "Section 201: exact quote"]
}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1000
    })

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    const parsed = JSON.parse(content)
    return {
      answer: parsed.answer,
      citations: parsed.citations || []
    }
  } catch (error) {
    console.error('Failed to generate bill analysis:', error)
    return {
      answer: "I can help you understand this bill, but I'm having trouble processing your question right now. Please try rephrasing your question.",
      citations: []
    }
  }
}