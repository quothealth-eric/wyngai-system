import { PHIPattern } from './types';

/**
 * HIPAA PHI Detection Patterns
 * Based on 45 CFR §164.514(b)(2) - Safe Harbor Method
 */
export class PHIPatterns {

  public static readonly PATTERNS: PHIPattern[] = [
    // 1. Names (first, last, maiden)
    {
      id: 'PERSON_NAME_FULL',
      name: 'Full Person Name',
      category: 'PERSON_NAME',
      pattern: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
      confidence: 0.7,
      replacement: '[NAME]',
      description: 'Full name pattern (First Last)'
    },
    {
      id: 'PERSON_NAME_WITH_MIDDLE',
      name: 'Person Name with Middle',
      category: 'PERSON_NAME',
      pattern: /\b[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+\b/g,
      confidence: 0.8,
      replacement: '[NAME]',
      description: 'Full name with middle initial (First M. Last)'
    },

    // 2. Social Security Numbers
    {
      id: 'SSN_STANDARD',
      name: 'Social Security Number',
      category: 'SSN',
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      confidence: 0.95,
      replacement: '[SSN]',
      description: 'Standard SSN format (XXX-XX-XXXX)'
    },
    {
      id: 'SSN_NO_HYPHENS',
      name: 'SSN without hyphens',
      category: 'SSN',
      pattern: /\b\d{9}\b/g,
      confidence: 0.8,
      replacement: '[SSN]',
      description: 'SSN without separators (XXXXXXXXX)'
    },

    // 3. Phone Numbers
    {
      id: 'PHONE_US_STANDARD',
      name: 'US Phone Number',
      category: 'PHONE',
      pattern: /\b\(\d{3}\)\s?\d{3}-?\d{4}\b/g,
      confidence: 0.9,
      replacement: '[PHONE]',
      description: 'US phone format (XXX) XXX-XXXX'
    },
    {
      id: 'PHONE_DASH_FORMAT',
      name: 'Phone Number with dashes',
      category: 'PHONE',
      pattern: /\b\d{3}-\d{3}-\d{4}\b/g,
      confidence: 0.9,
      replacement: '[PHONE]',
      description: 'Phone format XXX-XXX-XXXX'
    },
    {
      id: 'PHONE_DOT_FORMAT',
      name: 'Phone Number with dots',
      category: 'PHONE',
      pattern: /\b\d{3}\.\d{3}\.\d{4}\b/g,
      confidence: 0.9,
      replacement: '[PHONE]',
      description: 'Phone format XXX.XXX.XXXX'
    },

    // 4. Email Addresses
    {
      id: 'EMAIL_STANDARD',
      name: 'Email Address',
      category: 'EMAIL',
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      confidence: 0.95,
      replacement: '[EMAIL]',
      description: 'Standard email format'
    },

    // 5. Addresses (simplified patterns)
    {
      id: 'ZIP_CODE',
      name: 'ZIP Code',
      category: 'ADDRESS',
      pattern: /\b\d{5}(-\d{4})?\b/g,
      confidence: 0.8,
      replacement: '[ZIP]',
      description: 'ZIP code (XXXXX or XXXXX-XXXX)'
    },
    {
      id: 'STREET_ADDRESS',
      name: 'Street Address',
      category: 'ADDRESS',
      pattern: /\b\d+\s+[A-Za-z\s]+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln|Way|Court|Ct)\b/gi,
      confidence: 0.7,
      replacement: '[ADDRESS]',
      description: 'Street address pattern'
    },

    // 6. Medical Record Numbers
    {
      id: 'MRN_PATTERN',
      name: 'Medical Record Number',
      category: 'MEDICAL_RECORD_NUMBER',
      pattern: /\b(MRN|Medical\s*Record|Patient\s*ID)[:\s]*[A-Z0-9]{6,12}\b/gi,
      confidence: 0.9,
      replacement: '[MRN]',
      description: 'Medical record number'
    },

    // 7. Account Numbers
    {
      id: 'ACCOUNT_NUMBER',
      name: 'Account Number',
      category: 'ACCOUNT_NUMBER',
      pattern: /\b(Account|Acct)[:\s]*[A-Z0-9]{6,20}\b/gi,
      confidence: 0.8,
      replacement: '[ACCOUNT]',
      description: 'Account number'
    },

    // 8. Health Plan Beneficiary Numbers
    {
      id: 'HEALTH_PLAN_ID',
      name: 'Health Plan ID',
      category: 'HEALTH_PLAN_NUMBER',
      pattern: /\b(Member\s*ID|Policy\s*Number|Group\s*Number)[:\s]*[A-Z0-9]{6,20}\b/gi,
      confidence: 0.85,
      replacement: '[PLAN_ID]',
      description: 'Health plan identifier'
    },

    // 9. Certificate/License Numbers
    {
      id: 'LICENSE_NUMBER',
      name: 'License Number',
      category: 'CERTIFICATE_LICENSE_NUMBER',
      pattern: /\b(License|Cert|Certificate)[:\s]*[A-Z0-9]{6,15}\b/gi,
      confidence: 0.8,
      replacement: '[LICENSE]',
      description: 'License or certificate number'
    },

    // 10. Vehicle Identifiers
    {
      id: 'LICENSE_PLATE',
      name: 'License Plate',
      category: 'VEHICLE_IDENTIFIER',
      pattern: /\b[A-Z0-9]{2,3}\s?[A-Z0-9]{3,4}\b/g,
      confidence: 0.6,
      replacement: '[PLATE]',
      description: 'License plate number'
    },

    // 11. Device Identifiers and Serial Numbers
    {
      id: 'DEVICE_SERIAL',
      name: 'Device Serial Number',
      category: 'DEVICE_IDENTIFIER',
      pattern: /\b(Serial|S\/N|Model)[:\s]*[A-Z0-9]{8,20}\b/gi,
      confidence: 0.7,
      replacement: '[DEVICE_ID]',
      description: 'Device serial number'
    },

    // 12. URLs
    {
      id: 'URL_HTTP',
      name: 'Web URL',
      category: 'URL',
      pattern: /https?:\/\/[^\s]+/g,
      confidence: 0.95,
      replacement: '[URL]',
      description: 'Web URL'
    },

    // 13. IP Addresses
    {
      id: 'IP_ADDRESS_V4',
      name: 'IPv4 Address',
      category: 'IP_ADDRESS',
      pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      confidence: 0.8,
      replacement: '[IP]',
      description: 'IPv4 address'
    },

    // 14. Dates (broad pattern for potential DOB)
    {
      id: 'DATE_MMDDYYYY',
      name: 'Date MM/DD/YYYY',
      category: 'DATE_OF_BIRTH',
      pattern: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
      confidence: 0.6, // Lower confidence as could be service dates
      replacement: '[DATE]',
      description: 'Date in MM/DD/YYYY format'
    },
    {
      id: 'DATE_MM_DD_YYYY',
      name: 'Date MM-DD-YYYY',
      category: 'DATE_OF_BIRTH',
      pattern: /\b\d{1,2}-\d{1,2}-\d{4}\b/g,
      confidence: 0.6,
      replacement: '[DATE]',
      description: 'Date in MM-DD-YYYY format'
    },

    // 15. Ages over 89
    {
      id: 'AGE_OVER_89',
      name: 'Age over 89',
      category: 'AGE_OVER_89',
      pattern: /\b(9[0-9]|1[0-2][0-9])\s*(years?\s*old|yo|y\.o\.)\b/gi,
      confidence: 0.85,
      replacement: '[AGE_90+]',
      description: 'Age over 89 years'
    },

    // 16. Geographic subdivisions smaller than state
    {
      id: 'COUNTY_REFERENCE',
      name: 'County Reference',
      category: 'GEOGRAPHIC_SUBDIVISION',
      pattern: /\b[A-Z][a-z]+\s*County\b/g,
      confidence: 0.7,
      replacement: '[COUNTY]',
      description: 'County reference'
    },

    // Common healthcare-specific patterns
    {
      id: 'INSURANCE_CLAIM_NUMBER',
      name: 'Insurance Claim Number',
      category: 'ACCOUNT_NUMBER',
      pattern: /\b(Claim|Ref|Reference)[:\s]*[A-Z0-9]{8,20}\b/gi,
      confidence: 0.8,
      replacement: '[CLAIM_NUM]',
      description: 'Insurance claim number'
    },

    // Credit card numbers (financial PHI)
    {
      id: 'CREDIT_CARD',
      name: 'Credit Card Number',
      category: 'ACCOUNT_NUMBER',
      pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      confidence: 0.9,
      replacement: '[CARD]',
      description: 'Credit card number'
    },

    // Bank account numbers
    {
      id: 'BANK_ACCOUNT',
      name: 'Bank Account',
      category: 'ACCOUNT_NUMBER',
      pattern: /\b(Account|Routing)[:\s]*\d{8,17}\b/gi,
      confidence: 0.8,
      replacement: '[BANK_ACCOUNT]',
      description: 'Bank account number'
    }
  ];

  /**
   * Get patterns by category
   */
  public static getPatternsByCategory(category: string): PHIPattern[] {
    return this.PATTERNS.filter(pattern => pattern.category === category);
  }

  /**
   * Get high-confidence patterns (>= 0.8)
   */
  public static getHighConfidencePatterns(): PHIPattern[] {
    return this.PATTERNS.filter(pattern => pattern.confidence >= 0.8);
  }

  /**
   * Get patterns above confidence threshold
   */
  public static getPatternsAboveThreshold(threshold: number): PHIPattern[] {
    return this.PATTERNS.filter(pattern => pattern.confidence >= threshold);
  }
}