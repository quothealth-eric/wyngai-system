import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

// Enhanced line item extraction patterns
const LINE_ITEM_PATTERNS = {
  // CPT codes with descriptions
  cpt: /\b(CPT[-\s]?)?(\d{5})\b[\s\-]*([^\n\r$]+?)[\s]*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,

  // HCPCS codes
  hcpcs: /\b([A-Z]\d{4})\b[\s\-]*([^\n\r$]+?)[\s]*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,

  // Revenue codes
  revenue: /\b(?:REV[-\s]?)?(\d{3,4})\b[\s\-]*([^\n\r$]+?)[\s]*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,

  // Generic line items with amounts
  generic: /^([^\n\r$]+?)[\s]*\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)$/gm,

  // Date patterns
  dates: /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g,

  // Modifiers
  modifiers: /\b(2[0-9]|5[0-9]|7[0-9]|8[0-9]|9[0-9]|X[EPSU]|GT|GQ|TC|26|RT|LT|F[0-9]|T[A-Z])\b/g
}

interface LineItem {
  document_id: string
  page_number: number
  line_number: number
  code?: string
  code_type: 'CPT' | 'HCPCS' | 'REV' | 'GENERIC' | 'UNKNOWN'
  description?: string
  units?: number
  charge?: number
  date_of_service?: string
  modifiers?: string[]
  raw_text: string
}

export async function POST(request: NextRequest) {
  console.log('🔍 Starting line item extraction...')

  try {
    const { documentId, ocrText, fileName } = await request.json()

    if (!documentId || !ocrText) {
      return NextResponse.json(
        { error: 'Missing documentId or ocrText' },
        { status: 400 }
      )
    }

    console.log(`📄 Extracting line items from document ${documentId} (${fileName})`)
    console.log(`📝 OCR text length: ${ocrText.length} characters`)
    console.log(`🔍 OCR text hash: ${Buffer.from(ocrText).toString('hex').slice(0, 20)}...`) // Log OCR text hash for verification
    console.log(`📝 OCR preview: "${ocrText.substring(0, 100)}..."`) // Log preview to verify content

    // Extract line items using multiple patterns
    const extractedItems: LineItem[] = []
    let lineNumber = 1

    // 1. Extract CPT codes
    const cptMatches = Array.from(ocrText.matchAll(LINE_ITEM_PATTERNS.cpt))
    console.log(`🔍 Found ${cptMatches.length} potential CPT codes`)

    for (const match of cptMatches) {
      const [fullMatch, prefix, code, description, amount] = match as RegExpMatchArray
      const charge = parseFloat(amount.replace(/,/g, ''))

      // Validate CPT code range
      if (parseInt(code) >= 90000 && parseInt(code) <= 99999) {
        extractedItems.push({
          document_id: documentId,
          page_number: 1, // Default to page 1, could be enhanced
          line_number: lineNumber++,
          code: code,
          code_type: 'CPT',
          description: description.trim().substring(0, 255), // Limit description length
          charge: charge,
          raw_text: fullMatch.trim()
        })
      }
    }

    // 2. Extract HCPCS codes
    const hcpcsMatches = Array.from(ocrText.matchAll(LINE_ITEM_PATTERNS.hcpcs))
    console.log(`🔍 Found ${hcpcsMatches.length} potential HCPCS codes`)

    for (const match of hcpcsMatches) {
      const [fullMatch, code, description, amount] = match as RegExpMatchArray
      const charge = parseFloat(amount.replace(/,/g, ''))

      extractedItems.push({
        document_id: documentId,
        page_number: 1,
        line_number: lineNumber++,
        code: code,
        code_type: 'HCPCS',
        description: description.trim().substring(0, 255),
        charge: charge,
        raw_text: fullMatch.trim()
      })
    }

    // 3. Extract Revenue codes
    const revenueMatches = Array.from(ocrText.matchAll(LINE_ITEM_PATTERNS.revenue))
    console.log(`🔍 Found ${revenueMatches.length} potential Revenue codes`)

    for (const match of revenueMatches) {
      const [fullMatch, code, description, amount] = match as RegExpMatchArray
      const charge = parseFloat(amount.replace(/,/g, ''))

      // Validate revenue code range
      if (parseInt(code) >= 100 && parseInt(code) <= 999) {
        extractedItems.push({
          document_id: documentId,
          page_number: 1,
          line_number: lineNumber++,
          code: code,
          code_type: 'REV',
          description: description.trim().substring(0, 255),
          charge: charge,
          raw_text: fullMatch.trim()
        })
      }
    }

    // 4. Extract generic line items with dollar amounts
    const genericMatches = Array.from(ocrText.matchAll(LINE_ITEM_PATTERNS.generic))
    console.log(`🔍 Found ${genericMatches.length} potential generic line items`)

    for (const match of genericMatches) {
      const [fullMatch, description, amount] = match as RegExpMatchArray
      const charge = parseFloat(amount.replace(/,/g, ''))

      // Skip if we already have this as a coded item
      const alreadyExtracted = extractedItems.some(item =>
        Math.abs((item.charge || 0) - charge) < 0.01 &&
        item.description?.toLowerCase().includes(description.toLowerCase().substring(0, 20))
      )

      if (!alreadyExtracted && charge > 0 && charge < 100000) {
        extractedItems.push({
          document_id: documentId,
          page_number: 1,
          line_number: lineNumber++,
          code_type: 'GENERIC',
          description: description.trim().substring(0, 255),
          charge: charge,
          raw_text: fullMatch.trim()
        })
      }
    }

    // 5. Extract dates for date of service
    const dateMatches = Array.from(ocrText.matchAll(LINE_ITEM_PATTERNS.dates))
    const extractedDates = dateMatches.map(match => {
      const regexMatch = match as RegExpMatchArray
      const dateStr = regexMatch[1]
      // Convert to YYYY-MM-DD format
      const parts = dateStr.split(/[\/\-]/)
      if (parts.length === 3) {
        let [month, day, year] = parts
        if (year.length === 2) {
          year = '20' + year // Assume 2000s
        }
        if (month.length === 1) month = '0' + month
        if (day.length === 1) day = '0' + day
        return `${year}-${month}-${day}`
      }
      return null
    }).filter(Boolean) as string[]

    // Assign dates to line items (distribute available dates)
    extractedItems.forEach((item, index) => {
      if (extractedDates.length > 0) {
        item.date_of_service = extractedDates[index % extractedDates.length]
      }
    })

    console.log(`✅ Extracted ${extractedItems.length} line items total`)

    // Store line items in database
    if (extractedItems.length > 0) {
      console.log('💾 Storing line items in database...')

      const { data: insertedItems, error: insertError } = await supabase
        .from('line_items')
        .insert(extractedItems)
        .select()

      if (insertError) {
        console.error('❌ Failed to store line items:', insertError)

        // If table doesn't exist, return success but log the issue
        if (insertError.message?.includes('Could not find the table')) {
          console.warn('⚠️ Line items table does not exist. Please create it in Supabase.')
          console.log('📋 SQL to create table is available in supabase_schema.sql')

          // Return success with a note about the missing table
          return NextResponse.json({
            success: true,
            documentId,
            lineItemsExtracted: extractedItems.length,
            lineItems: extractedItems, // Return the extracted items even though not stored
            summary: {
              cptCodes: extractedItems.filter(i => i.code_type === 'CPT').length,
              hcpcsCodes: extractedItems.filter(i => i.code_type === 'HCPCS').length,
              revenueCodes: extractedItems.filter(i => i.code_type === 'REV').length,
              genericItems: extractedItems.filter(i => i.code_type === 'GENERIC').length,
              totalCharges: extractedItems.reduce((sum, item) => sum + (item.charge || 0), 0),
              datesFound: extractedDates.length
            },
            warning: 'Line items extracted but not stored - database table missing'
          })
        }

        return NextResponse.json(
          { error: 'Failed to store line items', details: insertError.message },
          { status: 500 }
        )
      }

      console.log(`✅ Stored ${insertedItems.length} line items successfully`)

      // Update document status
      const { error: updateError } = await supabase
        .from('files')
        .update({
          status: 'line_items_extracted',
          line_item_count: extractedItems.length
        })
        .eq('id', documentId)

      if (updateError) {
        console.warn('⚠️ Failed to update document status:', updateError)
      }

      return NextResponse.json({
        success: true,
        documentId,
        lineItemsExtracted: extractedItems.length,
        lineItems: insertedItems,
        summary: {
          cptCodes: extractedItems.filter(i => i.code_type === 'CPT').length,
          hcpcsCodes: extractedItems.filter(i => i.code_type === 'HCPCS').length,
          revenueCodes: extractedItems.filter(i => i.code_type === 'REV').length,
          genericItems: extractedItems.filter(i => i.code_type === 'GENERIC').length,
          totalCharges: extractedItems.reduce((sum, item) => sum + (item.charge || 0), 0),
          datesFound: extractedDates.length
        }
      })
    } else {
      console.log('⚠️ No line items extracted from OCR text')
      return NextResponse.json({
        success: true,
        documentId,
        lineItemsExtracted: 0,
        lineItems: [],
        message: 'No billable line items detected in OCR text'
      })
    }

  } catch (error) {
    console.error('❌ Line item extraction failed:', error)
    return NextResponse.json(
      {
        error: 'Line item extraction failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Line Item Extraction API',
    methods: ['POST'],
    description: 'Extracts billable line items from OCR text and stores them in the database',
    patterns: {
      cpt: 'CPT codes (90000-99999)',
      hcpcs: 'HCPCS codes (A-Z####)',
      revenue: 'Revenue codes (100-999)',
      generic: 'Generic line items with dollar amounts',
      dates: 'Service dates (MM/DD/YYYY format)',
      modifiers: 'Billing modifiers'
    }
  })
}