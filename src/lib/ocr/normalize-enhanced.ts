/**
 * Enhanced normalization with strict validators for OpenAI Vision and fallback OCR
 * Deterministic parsing with no hallucinations
 */

import { ParsedLine, OCRResult } from '@/lib/types/ocr';
import { OpenAIVisionResult } from './openai-vision';

/**
 * Strict validators for medical billing codes and amounts
 */
export const VALIDATORS = {
  // CPT codes: 5 digits
  CPT: /^\d{5}$/,

  // HCPCS codes: Letter + 4 digits (J-, A-, etc.)
  HCPCS: /^[A-Z]\d{4}$/,

  // Revenue codes: 3 digits
  REV: /^\d{3}$/,

  // Place of Service: 2 digits
  POS: /^\d{2}$/,

  // Money amounts: $123.45, 123.45, $1,234.56, etc.
  MONEY: /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/,

  // Date formats: MM/DD/YYYY, MM-DD-YYYY, etc.
  DATE: /^(0[1-9]|1[0-2])[\/\-](0[1-9]|[12]\d|3[01])[\/\-](19|20)\d{2}$/,

  // NPI: 10 digits
  NPI: /^\d{10}$/,

  // Modifier codes: 2 alphanumeric characters
  MODIFIER: /^[A-Z0-9]{2}$/
};

/**
 * Normalize OpenAI Vision structured JSON to ParsedLine format
 */
export function normalizeOpenAIVisionResult(
  visionResult: OpenAIVisionResult,
  fileId: string,
  pageNumber: number
): ParsedLine[] {
  const lines: ParsedLine[] = [];

  if (!visionResult.rows || !Array.isArray(visionResult.rows)) {
    console.warn('No rows found in OpenAI Vision result');
    return lines;
  }

  visionResult.rows.forEach((row, index) => {
    // Only create a line if it has at least one money amount
    const hasMoneyAmount = !!(
      row.charge || row.allowed || row.plan_paid || row.patient_resp
    );

    if (!hasMoneyAmount) {
      console.log(`Skipping row ${index} - no money amount found`);
      return;
    }

    const lineId = `${fileId}_page${pageNumber}_row${index}`;

    // Validate and normalize code
    const { code, codeSystem, lowConf: codeLowConf } = validateAndNormalizeCode(row.code, row.code_system);

    // Validate and normalize money amounts
    const charge = normalizeMoneyToCents(row.charge);
    const allowed = normalizeMoneyToCents(row.allowed);
    const planPaid = normalizeMoneyToCents(row.plan_paid);
    const patientResp = normalizeMoneyToCents(row.patient_resp);

    // Validate and normalize date
    const dos = normalizeDateToISO(row.dos);

    // Validate other fields
    const units = typeof row.units === 'number' && row.units > 0 ? row.units : undefined;
    const pos = validateField(row.pos, VALIDATORS.POS) ? row.pos : undefined;
    const revCode = validateField(row.rev_code, VALIDATORS.REV) ? row.rev_code : undefined;
    const npi = validateField(row.npi, VALIDATORS.NPI) ? row.npi : undefined;

    // Validate modifiers
    const modifiers = row.modifiers && Array.isArray(row.modifiers)
      ? row.modifiers.filter(mod => validateField(mod, VALIDATORS.MODIFIER))
      : undefined;

    // Set lowConf if any validation failed
    const lowConf = codeLowConf ||
      (row.charge && !charge) ||
      (row.allowed && !allowed) ||
      (row.plan_paid && !planPaid) ||
      (row.patient_resp && !patientResp) ||
      (row.dos && !dos);

    const parsedLine: ParsedLine = {
      lineId,
      page: pageNumber,
      code,
      codeSystem,
      modifiers,
      description: row.description?.trim() || undefined,
      units,
      dos,
      pos,
      revCode,
      npi,
      charge,
      allowed,
      planPaid,
      patientResp,
      conf: 0.95, // OpenAI Vision typically high confidence
      lowConf
    };

    lines.push(parsedLine);
  });

  console.log(`Normalized ${lines.length} lines from OpenAI Vision structured data`);
  return lines;
}

/**
 * Normalize traditional OCR text to ParsedLine format (fallback for GCV/Tesseract)
 */
export function normalizeTraditionalOCRToLines(
  ocrResults: Record<string, OCRResult>
): ParsedLine[] {
  const lines: ParsedLine[] = [];

  for (const [fileId, result] of Object.entries(ocrResults)) {
    if (!result.success || !result.pages) continue;

    result.pages.forEach(page => {
      // Check if this page has structured data from OpenAI Vision
      if (page.structuredData) {
        const visionLines = normalizeOpenAIVisionResult(
          page.structuredData as OpenAIVisionResult,
          fileId,
          page.pageNumber
        );
        lines.push(...visionLines);
      } else {
        // Traditional text-based parsing for GCV/Tesseract
        const textLines = parseTextToLines(page.text, fileId, page.pageNumber);
        lines.push(...textLines);
      }
    });
  }

  return lines;
}

/**
 * Parse traditional OCR text into structured lines
 */
function parseTextToLines(text: string, fileId: string, pageNumber: number): ParsedLine[] {
  const lines: ParsedLine[] = [];
  const textLines = text.split('\n');

  textLines.forEach((textLine, index) => {
    const trimmed = textLine.trim();
    if (!trimmed) return;

    // Look for money amounts to identify service rows
    const moneyMatches = trimmed.match(/\$?\d{1,3}(,\d{3})*(\.\d{2})?/g);
    if (!moneyMatches || moneyMatches.length === 0) return;

    const lineId = `${fileId}_page${pageNumber}_line${index}`;

    // Try to extract code from beginning of line
    const tokens = trimmed.split(/\s+/);
    const { code, codeSystem } = extractCodeFromTokens(tokens);

    // Extract description (everything except codes and money)
    const description = extractDescription(trimmed, code, moneyMatches);

    // Parse money amounts (try to assign based on position/context)
    const amounts = parseMoneyAmounts(moneyMatches);

    // Try to extract date
    const dos = extractDateFromText(trimmed);

    const parsedLine: ParsedLine = {
      lineId,
      page: pageNumber,
      code,
      codeSystem,
      description,
      dos: dos ? normalizeDateToISO(dos) : undefined,
      charge: amounts.charge,
      allowed: amounts.allowed,
      planPaid: amounts.planPaid,
      patientResp: amounts.patientResp,
      conf: 0.8, // Lower confidence for text parsing
      lowConf: !code || amounts.uncertain
    };

    lines.push(parsedLine);
  });

  return lines;
}

/**
 * Validate and normalize medical codes
 */
function validateAndNormalizeCode(
  code?: string,
  codeSystem?: string
): { code?: string; codeSystem?: 'CPT' | 'HCPCS' | 'REV' | 'POS'; lowConf: boolean } {
  if (!code) return { lowConf: false };

  const cleanCode = code.trim().replace(/[^\w]/g, '');

  // Check CPT
  if (VALIDATORS.CPT.test(cleanCode)) {
    return { code: cleanCode, codeSystem: 'CPT', lowConf: false };
  }

  // Check HCPCS
  if (VALIDATORS.HCPCS.test(cleanCode)) {
    return { code: cleanCode, codeSystem: 'HCPCS', lowConf: false };
  }

  // Check REV
  if (VALIDATORS.REV.test(cleanCode)) {
    return { code: cleanCode, codeSystem: 'REV', lowConf: false };
  }

  // Check POS
  if (VALIDATORS.POS.test(cleanCode)) {
    return { code: cleanCode, codeSystem: 'POS', lowConf: false };
  }

  // If provided codeSystem doesn't match, mark as low confidence
  return { code: cleanCode, lowConf: true };
}

/**
 * Extract code from tokens (for traditional OCR text parsing)
 */
function extractCodeFromTokens(tokens: string[]): { code?: string; codeSystem?: 'CPT' | 'HCPCS' | 'REV' | 'POS' } {
  for (const token of tokens.slice(0, 3)) { // Check first few tokens
    const { code, codeSystem, lowConf } = validateAndNormalizeCode(token);
    if (code && !lowConf) {
      return { code, codeSystem };
    }
  }
  return {};
}

/**
 * Normalize money amount to cents
 */
function normalizeMoneyToCents(amount?: string): number | undefined {
  if (!amount) return undefined;

  const cleanAmount = amount.toString().replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleanAmount);

  if (isNaN(parsed) || parsed < 0) return undefined;

  return Math.round(parsed * 100); // Convert to cents
}

/**
 * Normalize date to ISO format (YYYY-MM-DD)
 */
function normalizeDateToISO(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;

  const match = dateStr.match(VALIDATORS.DATE);
  if (!match) return undefined;

  // Parse MM/DD/YYYY or MM-DD-YYYY
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Validate field against regex
 */
function validateField(value?: string, regex?: RegExp): boolean {
  if (!value || !regex) return false;
  return regex.test(value.trim());
}

/**
 * Extract description from text line
 */
function extractDescription(text: string, code?: string, moneyMatches?: string[]): string | undefined {
  let description = text;

  // Remove code if present
  if (code) {
    description = description.replace(new RegExp(`\\b${code}\\b`, 'g'), '');
  }

  // Remove money amounts
  if (moneyMatches) {
    moneyMatches.forEach(match => {
      description = description.replace(match, '');
    });
  }

  // Clean up extra whitespace
  description = description.replace(/\s+/g, ' ').trim();

  return description.length > 0 ? description : undefined;
}

/**
 * Parse money amounts from matches
 */
function parseMoneyAmounts(moneyMatches: string[]): {
  charge?: number;
  allowed?: number;
  planPaid?: number;
  patientResp?: number;
  uncertain: boolean;
} {
  const amounts = moneyMatches.map(normalizeMoneyToCents).filter(Boolean) as number[];

  if (amounts.length === 0) {
    return { uncertain: true };
  }

  // Simple heuristic: first amount is usually charge
  if (amounts.length === 1) {
    return { charge: amounts[0], uncertain: false };
  }

  // For multiple amounts, use positional logic (this is a simplification)
  return {
    charge: amounts[0],
    allowed: amounts[1],
    planPaid: amounts[2],
    patientResp: amounts[3],
    uncertain: amounts.length > 4
  };
}

/**
 * Extract date from text
 */
function extractDateFromText(text: string): string | undefined {
  const match = text.match(VALIDATORS.DATE);
  return match ? match[0] : undefined;
}