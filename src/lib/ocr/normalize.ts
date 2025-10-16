/**
 * OCR text normalization - converts raw OCR text into structured ParsedLine records
 */

import { OCRResult, ParsedLine } from '@/lib/types/ocr';
import {
  parseMoney,
  normalizeDate,
  getCodeSystem,
  parseModifiers,
  extractCodeFromDescription,
  isValidNPI,
  isValidPOS,
  isValidRevCode,
  validateParsedLine
} from './validators';
import { v4 as uuidv4 } from 'uuid';

/**
 * Convert OCR results into structured parsed lines
 */
export function normalizeOCRToLines(ocrResults: Record<string, OCRResult>): ParsedLine[] {
  const allLines: ParsedLine[] = [];

  for (const [fileId, result] of Object.entries(ocrResults)) {
    if (!result.success || !result.pages) continue;

    for (const page of result.pages) {
      const pageLines = parsePageToLines(page.pageNumber, page.text, page.lines || []);
      allLines.push(...pageLines);
    }
  }

  // Remove duplicate lines
  const uniqueLines = deduplicateLines(allLines);

  // Validate and flag low confidence lines
  return uniqueLines.map(line => ({
    ...line,
    lowConf: hasLowConfidence(line)
  }));
}

/**
 * Parse a single page of text into structured lines
 */
function parsePageToLines(
  pageNumber: number,
  pageText: string,
  ocrLines: { text: string; bbox?: [number, number, number, number]; confidence?: number }[]
): ParsedLine[] {
  const lines: ParsedLine[] = [];

  // Split page text into logical lines
  const textLines = pageText.split('\n').filter(line => line.trim());

  // Process each line looking for billing data
  for (let i = 0; i < textLines.length; i++) {
    const lineText = textLines[i].trim();
    if (!lineText) continue;

    // Look for lines that contain money amounts (likely billing lines)
    const moneyMatches = lineText.match(/\$?\d{1,3}(,\d{3})*(\.\d{2})?/g);
    if (!moneyMatches || moneyMatches.length === 0) continue;

    // Try to parse this as a billing line
    const parsedLine = parseBillingLine(lineText, pageNumber, i, ocrLines);
    if (parsedLine) {
      lines.push(parsedLine);
    }
  }

  return lines;
}

/**
 * Parse a single billing line into structured data
 */
function parseBillingLine(
  lineText: string,
  pageNumber: number,
  lineIndex: number,
  ocrLines: { text: string; bbox?: [number, number, number, number]; confidence?: number }[]
): ParsedLine | null {
  // Skip if line is too short to be meaningful
  if (lineText.length < 10) return null;

  const lineId = uuidv4();

  // Find corresponding OCR line for bbox and confidence
  const ocrLine = ocrLines.find(ol => ol.text.trim() === lineText);
  const bbox = ocrLine?.bbox;
  const conf = ocrLine?.confidence;

  // Initialize parsed line
  const parsedLine: Partial<ParsedLine> = {
    lineId,
    page: pageNumber,
    bbox,
    conf
  };

  // Split line into potential fields
  const fields = splitLineIntoFields(lineText);

  // Extract medical code (CPT/HCPCS/etc)
  const codeInfo = extractMedicalCode(fields);
  if (codeInfo) {
    parsedLine.code = codeInfo.code;
    parsedLine.codeSystem = codeInfo.system;
    parsedLine.modifiers = codeInfo.modifiers;
  }

  // Extract description
  parsedLine.description = extractDescription(fields, codeInfo?.code);

  // Extract monetary amounts
  const amounts = extractMonetaryAmounts(fields);
  Object.assign(parsedLine, amounts);

  // Extract units
  parsedLine.units = extractUnits(fields);

  // Extract date of service
  parsedLine.dos = extractDateOfService(fields);

  // Extract other identifiers
  parsedLine.npi = extractNPI(fields);
  parsedLine.pos = extractPOS(fields);
  parsedLine.revCode = extractRevCode(fields);

  // Validate the parsed line
  const errors = validateParsedLine(parsedLine);
  if (errors.length > 0) {
    console.warn(`Validation errors for line ${lineId}:`, errors);
  }

  // Only return if we have at least a charge amount or a valid code
  if (parsedLine.charge || parsedLine.code) {
    return parsedLine as ParsedLine;
  }

  return null;
}

/**
 * Split line text into potential field values
 */
function splitLineIntoFields(lineText: string): string[] {
  // Split by common delimiters, preserving meaningful spacing
  const fields = lineText
    .split(/\s{2,}|\t+/) // Split on multiple spaces or tabs
    .map(field => field.trim())
    .filter(field => field.length > 0);

  // If no clear delimiters, try to split by position/patterns
  if (fields.length <= 2) {
    // Look for patterns like: CODE DESCRIPTION $AMOUNT
    const patterns = [
      /^(\S+)\s+(.+?)\s+(\$[\d,]+\.?\d*)$/,
      /^(.+?)\s+(\$[\d,]+\.?\d*)\s+(\$[\d,]+\.?\d*)$/,
      /^(\S+)\s+(.+)$/
    ];

    for (const pattern of patterns) {
      const match = lineText.match(pattern);
      if (match) {
        return match.slice(1); // Remove full match, keep groups
      }
    }

    // Fallback: split on single spaces but preserve money amounts
    return lineText.split(/\s+/).filter(f => f.length > 0);
  }

  return fields;
}

/**
 * Extract medical code information from fields
 */
function extractMedicalCode(fields: string[]): {
  code: string;
  system: 'CPT' | 'HCPCS' | 'REV' | 'POS';
  modifiers?: string[];
} | null {
  for (const field of fields) {
    // Check if field is a valid medical code
    const system = getCodeSystem(field);
    if (system) {
      return {
        code: field.trim().toUpperCase(),
        system
      };
    }

    // Check if field contains code with modifiers (e.g., "99213-25")
    const codeWithModifiers = field.match(/^([A-Z]?\d{2,5})[-,](.+)$/);
    if (codeWithModifiers) {
      const [, code, modifierStr] = codeWithModifiers;
      const system = getCodeSystem(code);
      if (system) {
        return {
          code: code.toUpperCase(),
          system,
          modifiers: parseModifiers(modifierStr)
        };
      }
    }

    // Check for code in description
    const extracted = extractCodeFromDescription(field);
    if (extracted) {
      const system = getCodeSystem(extracted.code);
      if (system) {
        return {
          code: extracted.code.toUpperCase(),
          system
        };
      }
    }
  }

  return null;
}

/**
 * Extract description, excluding the code if present
 */
function extractDescription(fields: string[], excludeCode?: string): string | undefined {
  const descriptionParts: string[] = [];

  for (const field of fields) {
    // Skip if this field is the code itself
    if (excludeCode && field.includes(excludeCode)) continue;

    // Skip if this field looks like a money amount
    if (parseMoney(field) !== null) continue;

    // Skip if this field looks like a code
    if (getCodeSystem(field)) continue;

    // Skip if this field looks like a date
    if (normalizeDate(field)) continue;

    // Skip very short fields that are likely codes or IDs
    if (field.length <= 3) continue;

    descriptionParts.push(field);
  }

  const description = descriptionParts.join(' ').trim();
  return description.length > 0 ? description : undefined;
}

/**
 * Extract monetary amounts from fields
 */
function extractMonetaryAmounts(fields: string[]): {
  charge?: number;
  allowed?: number;
  planPaid?: number;
  patientResp?: number;
} {
  const amounts: { charge?: number; allowed?: number; planPaid?: number; patientResp?: number } = {};
  const moneyFields = fields.filter(field => parseMoney(field) !== null);

  if (moneyFields.length === 0) return amounts;

  // Parse all money amounts
  const parsedAmounts = moneyFields.map(field => parseMoney(field)!);

  // Heuristics for assigning amounts based on position and context
  if (parsedAmounts.length === 1) {
    // Single amount - likely the charge
    amounts.charge = parsedAmounts[0];
  } else if (parsedAmounts.length === 2) {
    // Two amounts - could be charge/allowed or charge/patient responsibility
    amounts.charge = parsedAmounts[0];
    amounts.allowed = parsedAmounts[1];
  } else if (parsedAmounts.length >= 3) {
    // Multiple amounts - try to identify by position/context
    amounts.charge = parsedAmounts[0];
    amounts.allowed = parsedAmounts[1];
    amounts.planPaid = parsedAmounts[2];
    if (parsedAmounts.length >= 4) {
      amounts.patientResp = parsedAmounts[3];
    }
  }

  return amounts;
}

/**
 * Extract units from fields
 */
function extractUnits(fields: string[]): number | undefined {
  for (const field of fields) {
    // Look for unit patterns
    const unitMatch = field.match(/^(\d+)\s*(?:units?|qty|x)?$/i);
    if (unitMatch) {
      const units = parseInt(unitMatch[1]);
      if (units > 0 && units <= 9999) {
        return units;
      }
    }
  }

  return undefined;
}

/**
 * Extract date of service from fields
 */
function extractDateOfService(fields: string[]): string | undefined {
  for (const field of fields) {
    const normalizedDate = normalizeDate(field);
    if (normalizedDate) {
      return normalizedDate;
    }
  }

  return undefined;
}

/**
 * Extract NPI from fields
 */
function extractNPI(fields: string[]): string | undefined {
  for (const field of fields) {
    if (isValidNPI(field)) {
      return field.trim();
    }
  }

  return undefined;
}

/**
 * Extract Place of Service from fields
 */
function extractPOS(fields: string[]): string | undefined {
  for (const field of fields) {
    if (isValidPOS(field)) {
      return field.trim();
    }
  }

  return undefined;
}

/**
 * Extract Revenue Code from fields
 */
function extractRevCode(fields: string[]): string | undefined {
  for (const field of fields) {
    if (isValidRevCode(field)) {
      return field.trim();
    }
  }

  return undefined;
}

/**
 * Remove duplicate lines based on key characteristics
 */
function deduplicateLines(lines: ParsedLine[]): ParsedLine[] {
  const seen = new Set<string>();
  const unique: ParsedLine[] = [];

  for (const line of lines) {
    // Create deduplication key based on key fields
    const key = [
      line.code || '',
      line.description?.substring(0, 50) || '',
      line.dos || '',
      line.charge || 0
    ].join('|');

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(line);
    }
  }

  return unique;
}

/**
 * Determine if a line has low confidence and should be flagged
 */
function hasLowConfidence(line: ParsedLine): boolean {
  // Low OCR confidence
  if (line.conf !== undefined && line.conf < 0.7) return true;

  // No valid code detected
  if (!line.code) return true;

  // Description is very short or missing
  if (!line.description || line.description.length < 5) return true;

  // No monetary amounts
  if (!line.charge && !line.allowed && !line.planPaid && !line.patientResp) return true;

  return false;
}