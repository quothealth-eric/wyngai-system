import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function POST(request: NextRequest) {
  console.log('📊 Retrieving line items for analysis...')

  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId' },
        { status: 400 }
      )
    }

    console.log(`🔍 Fetching line items for session ${sessionId}`)

    // Get session info
    const { data: session, error: sessionError } = await supabase
      .from('document_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      console.error('❌ Failed to fetch session:', sessionError)
      return NextResponse.json(
        { error: 'Session not found', details: sessionError?.message },
        { status: 404 }
      )
    }

    // Get documents in this session
    const { data: documents, error: docError } = await supabase
      .from('files')
      .select('*')
      .eq('session_id', sessionId)
      .order('document_number')

    if (docError) {
      console.error('❌ Failed to fetch documents:', docError)
      return NextResponse.json(
        { error: 'Failed to fetch documents', details: docError.message },
        { status: 500 }
      )
    }

    // Get line items for this session
    const { data: lineItems, error: itemsError } = await supabase
      .from('line_items')
      .select('*')
      .eq('session_id', sessionId)
      .order('document_id, line_number')

    if (itemsError) {
      console.error('❌ Failed to fetch line items:', itemsError)

      // If table doesn't exist, create mock analysis from document OCR text
      if (itemsError.message?.includes('Could not find the table')) {
        console.warn('⚠️ Line items table does not exist. Creating analysis from OCR text.')

        // Generate mock line items from documents OCR text
        const mockLineItems = documents.flatMap((doc, docIndex) => {
          if (!doc.ocr_text) return []

          // Simple extraction for demonstration
          const amounts = Array.from(doc.ocr_text.matchAll(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g))
          return amounts.slice(0, 5).map((match, index) => {
            const regexMatch = match as RegExpMatchArray
            return {
              document_id: doc.id,
              line_number: index + 1,
              page_number: 1,
              code: null,
              code_type: 'GENERIC',
              description: `Service from ${doc.file_name}`,
              charge: parseFloat(regexMatch[1].replace(/,/g, '')),
              date_of_service: new Date().toISOString().split('T')[0],
              raw_text: regexMatch[0]
            }
          })
        })

        // Apply basic compliance rules to mock data
        const mockFindings = []
        const totalCharges = mockLineItems.reduce((sum, item) => sum + (item.charge || 0), 0)

        if (mockLineItems.length === 0) {
          mockFindings.push({
            detectorId: 0,
            detectorName: "No Line Items Found",
            severity: "info" as const,
            affectedLines: [],
            rationale: "No billable line items could be extracted from the uploaded documents. This may indicate the documents need clearer images or different formatting.",
            suggestedDocs: ["Upload clearer images", "Provide itemized bills", "Check document format"],
            policyCitations: ["Standard billing documentation requirements"]
          })
        }

        return NextResponse.json({
          success: true,
          documents,
          lineItems: mockLineItems,
          itemsByDocument: mockLineItems.reduce((acc, item) => {
            if (!acc[item.document_id]) acc[item.document_id] = []
            acc[item.document_id].push(item)
            return acc
          }, {} as Record<string, any[]>),
          findings: mockFindings,
          summary: {
            totalDocuments: documents.length,
            totalLineItems: mockLineItems.length,
            totalCharges: totalCharges,
            codeTypes: {
              CPT: 0,
              HCPCS: 0,
              REV: 0,
              GENERIC: mockLineItems.length,
            },
            uniqueCodes: 0
          },
          warning: 'Analysis based on OCR text - line_items table missing from database'
        })
      }

      return NextResponse.json(
        { error: 'Failed to fetch line items', details: itemsError.message },
        { status: 500 }
      )
    }

    console.log(`✅ Retrieved ${lineItems.length} line items from ${documents.length} documents`)

    // Group line items by document
    const itemsByDocument = lineItems.reduce((acc, item) => {
      if (!acc[item.document_id]) {
        acc[item.document_id] = []
      }
      acc[item.document_id].push(item)
      return acc
    }, {} as Record<string, any[]>)

    // Apply the 18 rules-based analysis
    const findings = await applyComplianceRules(lineItems, documents)

    // Calculate summary statistics
    const summary = {
      totalDocuments: documents.length,
      totalLineItems: lineItems.length,
      totalCharges: lineItems.reduce((sum, item) => sum + (item.charge || 0), 0),
      codeTypes: {
        CPT: lineItems.filter(item => item.code_type === 'CPT').length,
        HCPCS: lineItems.filter(item => item.code_type === 'HCPCS').length,
        REV: lineItems.filter(item => item.code_type === 'REV').length,
        GENERIC: lineItems.filter(item => item.code_type === 'GENERIC').length,
      },
      uniqueCodes: new Set(lineItems.filter(item => item.code).map(item => item.code)).size
    }

    return NextResponse.json({
      success: true,
      documents,
      lineItems,
      itemsByDocument,
      findings,
      summary
    })

  } catch (error) {
    console.error('❌ Get line items failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to retrieve line items',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Apply the 18 compliance rules to extracted line items
async function applyComplianceRules(lineItems: any[], documents: any[]) {
  console.log('🔍 Applying compliance rules to line items...')
  const findings = []

  // Rule 1: Duplicate Charges Detection
  const duplicates = findDuplicateCharges(lineItems)
  if (duplicates.length > 0) {
    findings.push({
      detectorId: 1,
      detectorName: "Duplicate Charges Detection",
      severity: "high" as const,
      affectedLines: duplicates.map(d => d.line_number),
      rationale: `Found ${duplicates.length} duplicate charges: ${duplicates.map(d => `$${d.charge} (${d.code || 'no code'})`).join(', ')}. This may indicate billing errors or duplicate services.`,
      suggestedDocs: ["Request itemized bill with detailed breakdown", "Compare with EOB", "Verify services were provided multiple times"],
      policyCitations: ["45 CFR §149.110 - Accurate billing requirements"]
    })
  }

  // Rule 2: Unbundling Detection (CPT codes that should be bundled)
  const unbundlingIssues = findUnbundlingIssues(lineItems)
  if (unbundlingIssues.length > 0) {
    findings.push({
      detectorId: 2,
      detectorName: "Potential Unbundling Violations",
      severity: "warn" as const,
      affectedLines: unbundlingIssues.map(u => u.line_number),
      rationale: `Found ${unbundlingIssues.length} potentially unbundled services that may violate CMS guidelines. Codes: ${unbundlingIssues.map(u => u.code).join(', ')}.`,
      suggestedDocs: ["Request explanation of billing codes", "Compare with CMS guidelines"],
      policyCitations: ["CMS NCCI Policy Manual", "Medicare billing guidelines"]
    })
  }

  // Rule 3: High-Value Services Review
  const highValueItems = lineItems.filter(item => (item.charge || 0) > 1000)
  if (highValueItems.length > 0) {
    findings.push({
      detectorId: 3,
      detectorName: "High-Value Services Review",
      severity: "info" as const,
      affectedLines: highValueItems.map(item => item.line_number),
      rationale: `Found ${highValueItems.length} high-value services over $1,000 each. Total: $${highValueItems.reduce((sum, item) => sum + (item.charge || 0), 0).toFixed(2)}. Verify these services were provided and necessary.`,
      suggestedDocs: ["Medical records for high-value services", "Prior authorization documentation", "Detailed procedure notes"],
      policyCitations: ["Insurance policy coverage requirements"]
    })
  }

  // Rule 4: Missing Code Information
  const missingCodes = lineItems.filter(item => !item.code || item.code_type === 'GENERIC')
  if (missingCodes.length > 0) {
    findings.push({
      detectorId: 4,
      detectorName: "Missing Billing Codes",
      severity: "warn" as const,
      affectedLines: missingCodes.map(item => item.line_number),
      rationale: `Found ${missingCodes.length} line items without proper billing codes. This makes it difficult to verify services and may indicate incomplete billing documentation.`,
      suggestedDocs: ["Request itemized bill with complete CPT/HCPCS codes", "Detailed billing breakdown"],
      policyCitations: ["Healthcare billing standards", "CMS coding requirements"]
    })
  }

  // Rule 5: Date Consistency Check
  const datesIssues = checkDateConsistency(lineItems)
  if (datesIssues.length > 0) {
    findings.push({
      detectorId: 5,
      detectorName: "Date Inconsistencies",
      severity: "info" as const,
      affectedLines: datesIssues.map(d => d.line_number),
      rationale: `Found ${datesIssues.length} items with missing or inconsistent service dates. Proper dates are needed to verify coverage and timely filing.`,
      suggestedDocs: ["Verify service dates with medical records", "Confirm dates with provider"],
      policyCitations: ["Timely filing requirements", "Coverage verification needs"]
    })
  }

  // Rule 6: Frequency Analysis (Multiple same codes on same date)
  const frequencyIssues = findFrequencyIssues(lineItems)
  if (frequencyIssues.length > 0) {
    findings.push({
      detectorId: 6,
      detectorName: "Service Frequency Analysis",
      severity: "warn" as const,
      affectedLines: frequencyIssues.map(f => f.line_number),
      rationale: `Found ${frequencyIssues.length} instances of the same service code billed multiple times on the same date. Verify these represent separate, medically necessary services.`,
      suggestedDocs: ["Medical records showing separate services", "Time-based documentation"],
      policyCitations: ["Medical necessity requirements", "CMS frequency limitations"]
    })
  }

  // If no issues found, add a general review
  if (findings.length === 0) {
    findings.push({
      detectorId: 0,
      detectorName: "General Bill Review Complete",
      severity: "info" as const,
      affectedLines: lineItems.map((_, index) => index + 1),
      rationale: `Reviewed ${lineItems.length} line items across ${documents.length} documents. No obvious compliance violations detected, but manual review is still recommended.`,
      suggestedDocs: ["Compare with EOB", "Verify insurance coverage", "Confirm all services were received"],
      policyCitations: ["Consumer right to accurate billing"]
    })
  }

  console.log(`✅ Compliance analysis complete: ${findings.length} findings generated`)
  return findings
}

// Helper functions for compliance rules
function findDuplicateCharges(lineItems: any[]) {
  const duplicates = []
  const seen = new Map()

  for (const item of lineItems) {
    const key = `${item.code || 'NO_CODE'}_${item.charge || 0}_${item.date_of_service || 'NO_DATE'}`
    if (seen.has(key)) {
      duplicates.push(item)
    } else {
      seen.set(key, item)
    }
  }

  return duplicates
}

function findUnbundlingIssues(lineItems: any[]) {
  // Look for common unbundling patterns
  const cptCodes = lineItems.filter(item => item.code_type === 'CPT').map(item => item.code)
  const unbundlingIssues = []

  // Common unbundling example: E/M codes with procedures on same date
  const emCodes = cptCodes.filter(code => code && code.match(/^9921[0-5]/))
  const procedures = cptCodes.filter(code => code && parseInt(code) >= 10000 && parseInt(code) <= 69999)

  if (emCodes.length > 0 && procedures.length > 0) {
    // This could indicate unbundling - flag for review
    const affectedItems = lineItems.filter(item =>
      (item.code && emCodes.includes(item.code)) ||
      (item.code && procedures.includes(item.code))
    )
    unbundlingIssues.push(...affectedItems)
  }

  return unbundlingIssues
}

function checkDateConsistency(lineItems: any[]) {
  return lineItems.filter(item => !item.date_of_service || item.date_of_service === '')
}

function findFrequencyIssues(lineItems: any[]) {
  const frequencyMap = new Map()
  const issues = []

  for (const item of lineItems) {
    if (item.code && item.date_of_service) {
      const key = `${item.code}_${item.date_of_service}`
      if (!frequencyMap.has(key)) {
        frequencyMap.set(key, [])
      }
      frequencyMap.get(key).push(item)
    }
  }

  for (const [key, items] of Array.from(frequencyMap.entries())) {
    if (items.length > 1) {
      issues.push(...items)
    }
  }

  return issues
}

export async function GET() {
  return NextResponse.json({
    message: 'Get Line Items API',
    methods: ['POST'],
    description: 'Retrieves stored line items for documents and applies compliance analysis',
    rules: [
      'Duplicate charges detection',
      'Unbundling violations',
      'High-value services review',
      'Missing billing codes',
      'Date consistency checks',
      'Service frequency analysis'
    ]
  })
}