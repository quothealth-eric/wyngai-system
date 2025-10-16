/**
 * Validators for OCR-extracted medical billing data
 * Ensures extracted codes and amounts are valid before creating ParsedLine records
 */

// CPT codes: 5 digits
export const CPT_REGEX = /^\d{5}$/;

// HCPCS codes: letter followed by 4 digits
export const HCPCS_REGEX = /^[A-Z]\d{4}$/;

// Revenue codes: 3 digits
export const REV_CODE_REGEX = /^\d{3}$/;

// Place of Service: 2 digits
export const POS_REGEX = /^\d{2}$/;

// Money amounts: supports $, commas, and decimals
export const MONEY_REGEX = /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/;

// Date formats: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD
export const DATE_REGEX = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})|(\d{4}-\d{2}-\d{2})$/;

// NPI: 10 digits
export const NPI_REGEX = /^\d{10}$/;

// Modifier codes: 2 alphanumeric characters
export const MODIFIER_REGEX = /^[A-Z0-9]{2}$/;

/**
 * Validates if a string is a valid CPT code
 */
export function isValidCPT(code: string): boolean {
  if (!code) return false;
  return CPT_REGEX.test(code.trim());
}

/**
 * Validates if a string is a valid HCPCS code
 */
export function isValidHCPCS(code: string): boolean {
  if (!code) return false;
  return HCPCS_REGEX.test(code.trim().toUpperCase());
}

/**
 * Validates if a string is a valid Revenue code
 */
export function isValidRevCode(code: string): boolean {
  if (!code) return false;
  return REV_CODE_REGEX.test(code.trim());
}

/**
 * Validates if a string is a valid Place of Service code
 */
export function isValidPOS(code: string): boolean {
  if (!code) return false;
  return POS_REGEX.test(code.trim());
}

/**
 * Validates if a string is a valid NPI
 */
export function isValidNPI(npi: string): boolean {
  if (!npi) return false;
  return NPI_REGEX.test(npi.trim());
}

/**
 * Validates if a string is a valid modifier
 */
export function isValidModifier(modifier: string): boolean {
  if (!modifier) return false;
  return MODIFIER_REGEX.test(modifier.trim().toUpperCase());
}

/**
 * Determines the code system type for a given code
 */
export function getCodeSystem(code: string): "CPT" | "HCPCS" | "REV" | "POS" | null {
  if (!code) return null;

  const cleanCode = code.trim().toUpperCase();

  if (isValidCPT(cleanCode)) return "CPT";
  if (isValidHCPCS(cleanCode)) return "HCPCS";
  if (isValidRevCode(cleanCode)) return "REV";
  if (isValidPOS(cleanCode)) return "POS";

  return null;
}

/**
 * Parses a money string and returns cents
 * Returns null if invalid format
 */
export function parseMoney(moneyStr: string): number | null {
  if (!moneyStr) return null;

  const cleanStr = moneyStr.trim();
  if (!MONEY_REGEX.test(cleanStr)) return null;

  try {
    // Remove $ and commas, convert to number
    const numStr = cleanStr.replace(/[$,]/g, '');
    const dollars = parseFloat(numStr);

    if (isNaN(dollars) || dollars < 0) return null;

    // Convert to cents
    return Math.round(dollars * 100);
  } catch {
    return null;
  }
}

/**
 * Normalizes a date string to YYYY-MM-DD format
 * Returns null if invalid date
 */
export function normalizeDate(dateStr: string): string | null {
  if (!dateStr) return null;

  const cleanStr = dateStr.trim();
  if (!DATE_REGEX.test(cleanStr)) return null;

  try {
    let date: Date;

    // Handle different formats
    if (cleanStr.includes('/')) {
      // MM/DD/YYYY format
      const [month, day, year] = cleanStr.split('/');
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else if (cleanStr.includes('-')) {
      if (cleanStr.startsWith('2')) {
        // Already YYYY-MM-DD format
        date = new Date(cleanStr);
      } else {
        // MM-DD-YYYY format
        const [month, day, year] = cleanStr.split('-');
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
    } else {
      return null;
    }

    // Validate the date is reasonable (not in future, not too old)
    const now = new Date();
    const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());

    if (isNaN(date.getTime()) || date > now || date < tenYearsAgo) {
      return null;
    }

    // Return in YYYY-MM-DD format
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

/**
 * Validates and parses modifiers from a string
 * Returns array of valid modifiers
 */
export function parseModifiers(modifierStr: string): string[] {
  if (!modifierStr) return [];

  // Split by common separators and validate each
  const parts = modifierStr.split(/[,;\s]+/).filter(part => part.trim());
  const validModifiers: string[] = [];

  for (const part of parts) {
    const cleaned = part.trim().toUpperCase();
    if (isValidModifier(cleaned)) {
      validModifiers.push(cleaned);
    }
  }

  return validModifiers;
}

/**
 * Validates if a number represents reasonable medical units
 */
export function isValidUnits(units: number): boolean {
  return Number.isInteger(units) && units > 0 && units <= 9999;
}

/**
 * Extracts medical code from description text if present
 * Looks for codes at beginning of description
 */
export function extractCodeFromDescription(description: string): { code: string; cleanDescription: string } | null {
  if (!description) return null;

  const text = description.trim();

  // Look for code at the beginning
  const codeMatch = text.match(/^([A-Z]?\d{2,5})\s*[-:]\s*(.+)$/);
  if (codeMatch) {
    const [, potentialCode, remainingText] = codeMatch;
    if (getCodeSystem(potentialCode)) {
      return {
        code: potentialCode,
        cleanDescription: remainingText.trim()
      };
    }
  }

  return null;
}

/**
 * Comprehensive validation for a parsed line
 * Returns validation errors if any
 */
export function validateParsedLine(line: Partial<any>): string[] {
  const errors: string[] = [];

  if (line.code && !getCodeSystem(line.code)) {
    errors.push(`Invalid code format: ${line.code}`);
  }

  if (line.npi && !isValidNPI(line.npi)) {
    errors.push(`Invalid NPI: ${line.npi}`);
  }

  if (line.pos && !isValidPOS(line.pos)) {
    errors.push(`Invalid POS: ${line.pos}`);
  }

  if (line.revCode && !isValidRevCode(line.revCode)) {
    errors.push(`Invalid revenue code: ${line.revCode}`);
  }

  if (line.dos && !normalizeDate(line.dos)) {
    errors.push(`Invalid date of service: ${line.dos}`);
  }

  if (line.units !== undefined && !isValidUnits(line.units)) {
    errors.push(`Invalid units: ${line.units}`);
  }

  // Check for negative amounts
  const amounts = ['charge', 'allowed', 'planPaid', 'patientResp'];
  for (const amount of amounts) {
    if (line[amount] !== undefined && line[amount] < 0) {
      errors.push(`Negative amount not allowed for ${amount}: ${line[amount]}`);
    }
  }

  return errors;
}