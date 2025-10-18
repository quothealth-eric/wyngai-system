import { OCRResult, EOBLine, EOBSummary } from '@/lib/types/ocr'

/**
 * Parse EOB OCR results to extract structured EOB data
 */
export function parseEOBToLines(ocrResults: Record<string, OCRResult>): EOBLine[] {
  const lines: EOBLine[] = []

  // Process each file's OCR results
  for (const [fileId, ocrResult] of Object.entries(ocrResults)) {
    if (!ocrResult.success || !ocrResult.pages) continue

    // Process each page
    for (const page of ocrResult.pages) {
      const pageLines = extractEOBLinesFromText(page.text, page.pageNumber, fileId)
      lines.push(...pageLines)
    }
  }

  return lines
}

/**
 * Extract EOB lines from OCR text using pattern matching
 */
function extractEOBLinesFromText(text: string, page: number, fileId: string): EOBLine[] {
  const lines: EOBLine[] = []
  const textLines = text.split('\n')

  let lineIndex = 0

  // Look for EOB line patterns
  for (const textLine of textLines) {
    const trimmed = textLine.trim()
    if (!trimmed) continue

    // Pattern for EOB lines: DATE | PROVIDER | SERVICE | BILLED | ALLOWED | PLAN PAID | PATIENT RESP
    // Common patterns:
    // MM/DD/YYYY Provider Name Service Description $XXX.XX $XXX.XX $XXX.XX $XXX.XX
    const eobLinePattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+(.+?)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)/

    const match = trimmed.match(eobLinePattern)
    if (match) {
      const [, dateStr, provider, service, billedStr, allowedStr, planPaidStr, patientRespStr] = match

      const eobLine: EOBLine = {
        lineId: `${fileId}_page${page}_line${lineIndex}`,
        page,
        dateOfService: dateStr,
        providerName: provider.trim(),
        serviceDescription: service.trim(),
        billed: parseAmount(billedStr),
        allowed: parseAmount(allowedStr),
        planPaid: parseAmount(planPaidStr),
        patientResp: parseAmount(patientRespStr),
        conf: 0.8, // Default confidence
        lowConf: false
      }

      lines.push(eobLine)
    }

    // Look for procedure codes (CPT codes)
    const cptPattern = /\b(\d{5})\b/g
    let cptMatch
    while ((cptMatch = cptPattern.exec(trimmed)) !== null) {
      const cptCode = cptMatch[1]

      // Find the most recent line to add the code to
      const lastLine = lines[lines.length - 1]
      if (lastLine && !lastLine.procedureCode) {
        lastLine.procedureCode = cptCode
      }
    }

    lineIndex++
  }

  return lines
}

/**
 * Extract EOB header information from OCR text
 */
export function extractEOBHeader(ocrResults: Record<string, OCRResult>): EOBSummary['header'] {
  const header: EOBSummary['header'] = {}

  // Combine all text to search for header information
  const allText = Object.values(ocrResults)
    .filter(result => result.success && result.pages)
    .flatMap(result => result.pages.map(page => page.text))
    .join('\n\n')

  // Extract member information
  const memberNamePattern = /(?:member name|patient name|name)[:\s]+([a-z\s,]+)/i
  const memberNameMatch = allText.match(memberNamePattern)
  if (memberNameMatch) {
    header.memberName = memberNameMatch[1].trim()
  }

  // Extract member ID
  const memberIdPattern = /(?:member id|patient id|id)[:\s]+([a-z0-9]+)/i
  const memberIdMatch = allText.match(memberIdPattern)
  if (memberIdMatch) {
    header.memberId = memberIdMatch[1].trim()
  }

  // Extract group number
  const groupPattern = /(?:group|grp)[:\s#]+([a-z0-9]+)/i
  const groupMatch = allText.match(groupPattern)
  if (groupMatch) {
    header.groupNumber = groupMatch[1].trim()
  }

  // Extract claim number
  const claimPattern = /(?:claim|claim number|claim no)[:\s#]+([a-z0-9\-]+)/i
  const claimMatch = allText.match(claimPattern)
  if (claimMatch) {
    header.claimNumber = claimMatch[1].trim()
  }

  // Extract provider name
  const providerPattern = /(?:provider|provider name)[:\s]+([a-z\s,&.]+)/i
  const providerMatch = allText.match(providerPattern)
  if (providerMatch) {
    header.provider = providerMatch[1].trim()
  }

  // Extract date of service range
  const dosRangePattern = /(?:date of service|service date|dos)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:to|through|-)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
  const dosRangeMatch = allText.match(dosRangePattern)
  if (dosRangeMatch) {
    header.dateOfService = {
      start: dosRangeMatch[1],
      end: dosRangeMatch[2]
    }
  } else {
    // Single date of service
    const dosPattern = /(?:date of service|service date|dos)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i
    const dosMatch = allText.match(dosPattern)
    if (dosMatch) {
      header.dateOfService = {
        start: dosMatch[1],
        end: dosMatch[1]
      }
    }
  }

  return header
}

/**
 * Calculate totals from EOB lines
 */
export function calculateEOBTotals(lines: EOBLine[]): Pick<EOBSummary['header'], 'totalBilled' | 'totalAllowed' | 'totalPlanPaid' | 'totalPatientResp'> {
  return {
    totalBilled: lines.reduce((sum, line) => sum + (line.billed || 0), 0),
    totalAllowed: lines.reduce((sum, line) => sum + (line.allowed || 0), 0),
    totalPlanPaid: lines.reduce((sum, line) => sum + (line.planPaid || 0), 0),
    totalPatientResp: lines.reduce((sum, line) => sum + (line.patientResp || 0), 0)
  }
}

/**
 * Create complete EOB summary from OCR results
 */
export function createEOBSummary(ocrResults: Record<string, OCRResult>): EOBSummary | null {
  if (Object.keys(ocrResults).length === 0) {
    return null
  }

  const lines = parseEOBToLines(ocrResults)
  const header = extractEOBHeader(ocrResults)
  const totals = calculateEOBTotals(lines)

  return {
    header: {
      ...header,
      ...totals
    },
    lines
  }
}

/**
 * Parse monetary amounts from text, handling various formats
 */
function parseAmount(amountStr: string): number {
  if (!amountStr) return 0

  // Remove $ and commas, handle negative amounts in parentheses
  const cleaned = amountStr
    .replace(/[$,\s]/g, '')
    .replace(/^\((.*)\)$/, '-$1') // Handle (123.45) as negative

  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) // Convert to cents
}