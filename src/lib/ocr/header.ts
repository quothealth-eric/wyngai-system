/**
 * Header information extraction from OCR text
 * Extracts provider, claim, and payer information from document headers
 */

import { OCRResult, PricedSummary } from '@/lib/types/ocr';
import { isValidNPI, normalizeDate } from './validators';

/**
 * Extract header information from OCR results
 */
export function extractHeaderInfo(ocrResults: Record<string, OCRResult>): PricedSummary['header'] {
  const header: PricedSummary['header'] = {};

  // Combine text from all pages for header analysis
  const allText = combineOCRText(ocrResults);
  const firstPageText = getFirstPageText(ocrResults);

  // Extract different header components
  header.providerName = extractProviderName(firstPageText);
  header.NPI = extractNPI(allText);
  header.claimId = extractClaimId(allText);
  header.accountId = extractAccountId(allText);
  header.serviceDates = extractServiceDateRange(allText);
  header.payer = extractPayer(firstPageText);

  return header;
}

/**
 * Combine all OCR text for comprehensive analysis
 */
function combineOCRText(ocrResults: Record<string, OCRResult>): string {
  const textParts: string[] = [];

  for (const result of Object.values(ocrResults)) {
    if (result.success && result.pages) {
      for (const page of result.pages) {
        if (page.text) {
          textParts.push(page.text);
        }
      }
    }
  }

  return textParts.join('\n\n');
}

/**
 * Get first page text for header extraction
 */
function getFirstPageText(ocrResults: Record<string, OCRResult>): string {
  for (const result of Object.values(ocrResults)) {
    if (result.success && result.pages && result.pages.length > 0) {
      return result.pages[0].text || '';
    }
  }
  return '';
}

/**
 * Extract provider name from document header
 */
function extractProviderName(text: string): string | undefined {
  const lines = text.split('\n').slice(0, 10); // Check first 10 lines

  // Patterns for provider identification
  const providerPatterns = [
    /^(.+?)(?:medical|clinic|hospital|health|group|associates|md|dr\.)/i,
    /provider:\s*(.+?)$/im,
    /bill\s+to:\s*(.+?)$/im,
    /facility:\s*(.+?)$/im,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+Medical|\s+Clinic|\s+Hospital))/,
  ];

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine || cleanLine.length < 5) continue;

    // Skip lines that look like addresses or dates
    if (/^\d+/.test(cleanLine) || /\d{2}\/\d{2}\/\d{4}/.test(cleanLine)) continue;

    for (const pattern of providerPatterns) {
      const match = cleanLine.match(pattern);
      if (match && match[1]) {
        const provider = match[1].trim();
        if (provider.length > 3 && provider.length < 100) {
          return provider;
        }
      }
    }

    // If line looks like a medical facility name (contains certain keywords)
    const medicalKeywords = /medical|clinic|hospital|health|care|group|associates|center/i;
    if (medicalKeywords.test(cleanLine) && cleanLine.length > 5 && cleanLine.length < 80) {
      // Make sure it's not a generic description
      const genericTerms = /statement|bill|invoice|claim|patient|service/i;
      if (!genericTerms.test(cleanLine)) {
        return cleanLine;
      }
    }
  }

  return undefined;
}

/**
 * Extract NPI from document
 */
function extractNPI(text: string): string | undefined {
  // Look for NPI patterns
  const npiPatterns = [
    /NPI:?\s*(\d{10})/i,
    /provider\s+id:?\s*(\d{10})/i,
    /tax\s+id:?\s*(\d{10})/i,
    /\b(\d{10})\b/g // Any 10-digit number
  ];

  for (const pattern of npiPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const potentialNPI = match[1];
      if (isValidNPI(potentialNPI)) {
        return potentialNPI;
      }
    }
  }

  return undefined;
}

/**
 * Extract claim ID from document
 */
function extractClaimId(text: string): string | undefined {
  const claimPatterns = [
    /claim\s+(?:id|number|#):?\s*([A-Z0-9\-]+)/i,
    /claim:?\s*([A-Z0-9\-]{8,20})/i,
    /reference\s+(?:number|#):?\s*([A-Z0-9\-]+)/i,
    /control\s+(?:number|#):?\s*([A-Z0-9\-]+)/i,
    /patient\s+control\s+(?:number|#):?\s*([A-Z0-9\-]+)/i
  ];

  for (const pattern of claimPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const claimId = match[1].trim();
      // Validate claim ID format (reasonable length, not all numbers unless long enough)
      if (claimId.length >= 6 && claimId.length <= 30) {
        return claimId;
      }
    }
  }

  return undefined;
}

/**
 * Extract account ID from document
 */
function extractAccountId(text: string): string | undefined {
  const accountPatterns = [
    /account\s+(?:id|number|#):?\s*([A-Z0-9\-]+)/i,
    /patient\s+(?:id|number|#):?\s*([A-Z0-9\-]+)/i,
    /member\s+(?:id|number|#):?\s*([A-Z0-9\-]+)/i,
    /policy\s+(?:id|number|#):?\s*([A-Z0-9\-]+)/i
  ];

  for (const pattern of accountPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const accountId = match[1].trim();
      if (accountId.length >= 4 && accountId.length <= 25) {
        return accountId;
      }
    }
  }

  return undefined;
}

/**
 * Extract service date range from document
 */
function extractServiceDateRange(text: string): { start?: string; end?: string } | undefined {
  const dateRange: { start?: string; end?: string } = {};

  // Patterns for date ranges
  const rangePatterns = [
    /service\s+dates?:?\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:to|through|-)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /dates?\s+of\s+service:?\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:to|through|-)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /from:?\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*to:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
  ];

  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[2]) {
      const startDate = normalizeDate(match[1]);
      const endDate = normalizeDate(match[2]);
      if (startDate && endDate) {
        dateRange.start = startDate;
        dateRange.end = endDate;
        return dateRange;
      }
    }
  }

  // Look for single service dates
  const singleDatePatterns = [
    /service\s+date:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /date\s+of\s+service:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /DOS:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
  ];

  for (const pattern of singleDatePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const serviceDate = normalizeDate(match[1]);
      if (serviceDate) {
        dateRange.start = serviceDate;
        dateRange.end = serviceDate;
        return dateRange;
      }
    }
  }

  return Object.keys(dateRange).length > 0 ? dateRange : undefined;
}

/**
 * Extract payer/insurance information from document
 */
function extractPayer(text: string): string | undefined {
  const lines = text.split('\n').slice(0, 15); // Check first 15 lines

  const payerPatterns = [
    /insurance:?\s*(.+?)$/im,
    /payer:?\s*(.+?)$/im,
    /plan:?\s*(.+?)$/im,
    /carrier:?\s*(.+?)$/im,
    /primary\s+insurance:?\s*(.+?)$/im
  ];

  // First try explicit patterns
  for (const pattern of payerPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const payer = match[1].trim();
      if (payer.length > 3 && payer.length < 80) {
        return payer;
      }
    }
  }

  // Look for common insurance company names in header
  const commonInsurers = [
    'aetna', 'anthem', 'blue cross', 'blue shield', 'cigna', 'humana',
    'united healthcare', 'unitedhealth', 'kaiser', 'medicare', 'medicaid',
    'tricare', 'bcbs', 'wellcare', 'molina', 'centene'
  ];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    for (const insurer of commonInsurers) {
      if (lowerLine.includes(insurer)) {
        // Extract the full insurance name from the line
        const words = line.trim().split(/\s+/);
        const startIndex = words.findIndex(word =>
          word.toLowerCase().includes(insurer.split(' ')[0])
        );

        if (startIndex >= 0) {
          // Take the insurance name and maybe a few surrounding words
          const insuranceName = words.slice(
            Math.max(0, startIndex - 1),
            Math.min(words.length, startIndex + 3)
          ).join(' ');

          if (insuranceName.length > 3 && insuranceName.length < 50) {
            return insuranceName;
          }
        }
      }
    }
  }

  return undefined;
}

/**
 * Extract totals information if present in header/footer
 */
export function extractTotalsFromHeader(text: string): PricedSummary['totals'] {
  const totals: PricedSummary['totals'] = {};

  // Patterns for different total types
  const totalPatterns = {
    billed: [
      /total\s+(?:billed|charges?):?\s*\$?([\d,]+\.?\d*)/i,
      /amount\s+billed:?\s*\$?([\d,]+\.?\d*)/i,
      /gross\s+charges?:?\s*\$?([\d,]+\.?\d*)/i
    ],
    allowed: [
      /allowed\s+amount:?\s*\$?([\d,]+\.?\d*)/i,
      /contracted\s+amount:?\s*\$?([\d,]+\.?\d*)/i,
      /approved\s+amount:?\s*\$?([\d,]+\.?\d*)/i
    ],
    planPaid: [
      /(?:plan|insurance)\s+paid:?\s*\$?([\d,]+\.?\d*)/i,
      /benefits?\s+paid:?\s*\$?([\d,]+\.?\d*)/i,
      /amount\s+paid:?\s*\$?([\d,]+\.?\d*)/i
    ],
    patientResp: [
      /patient\s+(?:responsibility|portion):?\s*\$?([\d,]+\.?\d*)/i,
      /(?:your|patient)\s+balance:?\s*\$?([\d,]+\.?\d*)/i,
      /amount\s+due:?\s*\$?([\d,]+\.?\d*)/i
    ]
  };

  for (const [key, patterns] of Object.entries(totalPatterns)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(amount) && amount >= 0) {
          (totals as any)[key] = Math.round(amount * 100); // Convert to cents
          break; // Use first match for each category
        }
      }
    }
  }

  return totals;
}