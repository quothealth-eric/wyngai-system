import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Environment validation
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!OPENAI_API_KEY || !ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error('Missing required environment variables for dual-vendor OCR');
}

// Initialize clients
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

export interface OCRRow {
  code?: string;
  code_system?: 'CPT' | 'HCPCS' | 'REV' | 'POS' | null;
  modifiers?: string[] | null;
  description?: string | null;
  units?: number | null;
  dos?: string | null;
  pos?: string | null;
  rev_code?: string | null;
  npi?: string | null;
  charge?: string | null;
  allowed?: string | null;
  plan_paid?: string | null;
  patient_resp?: string | null;
}

export interface OCRResponse {
  doc_type: 'EOB' | 'BILL' | 'LETTER' | 'PORTAL' | 'INSURANCE_CARD' | 'UNKNOWN';
  header: {
    provider_name?: string;
    provider_npi?: string;
    payer?: string;
    claim_id?: string;
    account_id?: string;
    service_dates?: { start?: string; end?: string };
    page: number;
    artifact_digest: string;
  };
  totals: {
    billed?: string;
    allowed?: string;
    plan_paid?: string;
    patient_resp?: string;
  };
  rows: OCRRow[];
  keyfacts?: {
    denial_reason?: string;
    carc_codes?: string[];
    rarc_codes?: string[];
    auth_or_referral?: string | null;
    claim_or_account_ref?: string | null;
    bin?: string | null;
    pcn?: string | null;
    grp?: string | null;
    member_id_masked?: string | null;
  };
}

export interface ConsensusResult {
  caseId: string;
  artifactId: string;
  pages: number;
  extractedRows: Array<{
    page: number;
    row_idx: number;
    doc_type: string;
    code?: string;
    code_system?: string;
    modifiers?: string[];
    description?: string;
    units?: number;
    dos?: Date | null;
    pos?: string;
    rev_code?: string;
    npi?: string;
    charge_cents?: number;
    allowed_cents?: number;
    plan_paid_cents?: number;
    patient_resp_cents?: number;
    keyfacts?: any;
    low_conf: boolean;
    vendor_consensus: number;
    validators: any;
    bbox?: any;
    conf: number;
  }>;
}

export class DualVendorOCRPipeline {
  /**
   * Process document with dual-vendor consensus
   */
  async processDocument(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    caseId: string,
    artifactId: string
  ): Promise<ConsensusResult> {
    console.log(`🔍 Starting dual-vendor OCR for ${filename}`);

    // 1. Compute artifact digest
    const artifactDigest = crypto.createHash('sha256').update(buffer).digest('hex');

    // 2. Pseudonymize document (if needed for PHI compliance)
    const processedBuffer = this.pseudonymizeDocument(buffer, mimeType);

    // 3. Convert to base64 for vision API calls
    const base64Image = processedBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    // 4. Call both vendors in parallel
    const [openaiResult, anthropicResult] = await Promise.allSettled([
      this.callOpenAIVision(dataUrl, artifactDigest, 1),
      this.callAnthropicVision(dataUrl, artifactDigest, 1)
    ]);

    console.log('📊 Vendor results:', {
      openai: openaiResult.status,
      anthropic: anthropicResult.status
    });

    // 5. Extract successful results
    const v1 = openaiResult.status === 'fulfilled' ? openaiResult.value : null;
    const v2 = anthropicResult.status === 'fulfilled' ? anthropicResult.value : null;

    if (!v1 && !v2) {
      throw new Error('Both OCR vendors failed');
    }

    // 6. Run consensus and validation
    const consensusRows = this.runConsensusValidation(v1, v2, caseId, artifactId);

    // 7. Persist to Supabase
    await this.persistToSupabase(caseId, artifactId, artifactDigest, consensusRows);

    console.log(`✅ Processed ${consensusRows.length} consensus rows for ${filename}`);

    return {
      caseId,
      artifactId,
      pages: 1,
      extractedRows: consensusRows
    };
  }

  /**
   * Pseudonymize PHI before sending to vendors
   */
  private pseudonymizeDocument(buffer: Buffer, mimeType: string): Buffer {
    // For now, return original buffer
    // In production, implement PHI detection and redaction
    // This could crop to specific regions, hash names, etc.
    return buffer;
  }

  /**
   * Call OpenAI Vision API with verbatim-only prompt
   */
  private async callOpenAIVision(dataUrl: string, artifactDigest: string, page: number): Promise<OCRResponse> {
    const systemPrompt = "You are a verbatim OCR transcriber. Do not infer or guess. If a token is not clearly visible, return null. Output strict JSON only.";

    const userPrompt = `You are reading a healthcare document image.

Return JSON with:
- doc_type: one of ["EOB","BILL","LETTER","PORTAL","INSURANCE_CARD","UNKNOWN"]
- header: { provider_name?, provider_npi?, payer?, claim_id?, account_id?, service_dates?:{start?,end?}, page: ${page}, artifact_digest: "${artifactDigest}" }
- totals: { billed?, allowed?, plan_paid?, patient_resp? }
- rows: array of objects where each row corresponds to ONE service line that visibly shows a monetary charge. Each row:
  { code?, code_system?: "CPT"|"HCPCS"|"REV"|"POS"|null,
    modifiers?: string[]|null,
    description?: string|null,
    units?: number|null,
    dos?: string|null,
    pos?: string|null,
    rev_code?: string|null,
    npi?: string|null,
    charge?: string|null, allowed?: string|null, plan_paid?: string|null, patient_resp?: string|null }
- keyfacts (for LETTER/PORTAL/CARD): { denial_reason?, carc_codes?:string[], rarc_codes?:string[], auth_or_referral?:string|null, claim_or_account_ref?:string|null, bin?:string|null, pcn?:string|null, grp?:string|null, member_id_masked?:string|null }

Rules:
- Transcribe ONLY text present in the image. NO synthesis. If unknown → null.
- Each 'rows' element must map to a single visual row with a visible money amount.
- For code, return exactly the token (e.g., '85025','J1200','A9150','36415','02491','02492'). Do not create '99213' unless the image shows it.
- Description should be the row's service text.
- Money as printed (e.g., '$938.00').
- Dates exactly as printed.

Image(s) attached. Output strict JSON.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content from OpenAI');
      }

      return JSON.parse(content) as OCRResponse;
    } catch (error) {
      console.error('❌ OpenAI Vision API error:', error);
      throw error;
    }
  }

  /**
   * Call Anthropic Vision API with verbatim-only prompt
   */
  private async callAnthropicVision(dataUrl: string, artifactDigest: string, page: number): Promise<OCRResponse> {
    const systemPrompt = "You are a verbatim OCR transcriber. Do not infer or guess. Return strict JSON only.";

    const userPrompt = `You are reading a healthcare document image.

Return JSON with:
- doc_type: one of ["EOB","BILL","LETTER","PORTAL","INSURANCE_CARD","UNKNOWN"]
- header: { provider_name?, provider_npi?, payer?, claim_id?, account_id?, service_dates?:{start?,end?}, page: ${page}, artifact_digest: "${artifactDigest}" }
- totals: { billed?, allowed?, plan_paid?, patient_resp? }
- rows: array of objects where each row corresponds to ONE service line that visibly shows a monetary charge. Each row:
  { code?, code_system?: "CPT"|"HCPCS"|"REV"|"POS"|null,
    modifiers?: string[]|null,
    description?: string|null,
    units?: number|null,
    dos?: string|null,
    pos?: string|null,
    rev_code?: string|null,
    npi?: string|null,
    charge?: string|null, allowed?: string|null, plan_paid?: string|null, patient_resp?: string|null }
- keyfacts (for LETTER/PORTAL/CARD): { denial_reason?, carc_codes?:string[], rarc_codes?:string[], auth_or_referral?:string|null, claim_or_account_ref?:string|null, bin?:string|null, pcn?:string|null, grp?:string|null, member_id_masked?:string|null }

Rules:
- Transcribe ONLY text present in the image. NO synthesis. If unknown → null.
- Each 'rows' element must map to a single visual row with a visible money amount.
- For code, return exactly the token (e.g., '85025','J1200','A9150','36415','02491','02492'). Do not create '99213' unless the image shows it.
- Description should be the row's service text.
- Money as printed (e.g., '$938.00').
- Dates exactly as printed.

Image(s) attached. Output strict JSON.`;

    try {
      // Convert data URL to proper format for Anthropic
      const base64Data = dataUrl.split(',')[1];
      const mediaType = dataUrl.split(';')[0].split(':')[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data
                }
              },
              {
                type: 'text',
                text: userPrompt
              }
            ]
          }
        ],
        temperature: 0
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Anthropic');
      }

      return JSON.parse(content.text) as OCRResponse;
    } catch (error) {
      console.error('❌ Anthropic Vision API error:', error);
      throw error;
    }
  }

  /**
   * Run consensus between vendor results and apply deterministic validators
   */
  private runConsensusValidation(
    v1: OCRResponse | null,
    v2: OCRResponse | null,
    caseId: string,
    artifactId: string
  ): Array<any> {
    const consensusRows: Array<any> = [];

    if (!v1 && !v2) return consensusRows;

    // Use the available result or merge if both exist
    const primaryResult = v1 || v2;
    const secondaryResult = v1 && v2 ? (v1 === primaryResult ? v2 : v1) : null;

    // Check if we have a primary result
    if (!primaryResult) {
      return [];
    }

    // Process each row from primary result
    for (let i = 0; i < primaryResult.rows.length; i++) {
      const row1 = primaryResult.rows[i];

      // Try to find matching row in secondary result
      let row2: OCRRow | null = null;
      let consensusScore = secondaryResult ? 0.5 : 1.0; // Default consensus

      if (secondaryResult) {
        // Find best matching row by fuzzy match
        row2 = this.findBestMatch(row1, secondaryResult.rows);
        consensusScore = this.calculateConsensusScore(row1, row2);
      }

      // Apply deterministic validators
      const validators = this.runValidators(row1, row2);
      const isLowConf = consensusScore < 0.7 || !validators.regex_pass;

      // Build consensus row
      const consensusRow = {
        page: 1,
        row_idx: i,
        doc_type: primaryResult.doc_type,
        code: this.getConsensusField(row1.code, row2?.code, validators.code_valid),
        code_system: this.getConsensusField(row1.code_system, row2?.code_system, true),
        modifiers: this.getConsensusField(row1.modifiers, row2?.modifiers, true),
        description: this.getConsensusField(row1.description, row2?.description, true),
        units: this.getConsensusField(row1.units, row2?.units, true),
        dos: this.parseDate(this.getConsensusField(row1.dos, row2?.dos, validators.date_valid) ?? null),
        pos: this.getConsensusField(row1.pos, row2?.pos, true),
        rev_code: this.getConsensusField(row1.rev_code, row2?.rev_code, true),
        npi: this.getConsensusField(row1.npi, row2?.npi, validators.npi_valid),
        charge_cents: this.parseMoney(this.getConsensusField(row1.charge, row2?.charge, validators.money_valid) ?? null),
        allowed_cents: this.parseMoney(this.getConsensusField(row1.allowed, row2?.allowed, validators.money_valid) ?? null),
        plan_paid_cents: this.parseMoney(this.getConsensusField(row1.plan_paid, row2?.plan_paid, validators.money_valid) ?? null),
        patient_resp_cents: this.parseMoney(this.getConsensusField(row1.patient_resp, row2?.patient_resp, validators.money_valid) ?? null),
        keyfacts: primaryResult.keyfacts || null,
        low_conf: isLowConf,
        vendor_consensus: consensusScore,
        validators,
        bbox: null, // Would be extracted from OCR coordinates
        conf: consensusScore
      };

      // Only include rows that pass basic validation
      if (validators.row_has_money || consensusRow.keyfacts) {
        consensusRows.push(consensusRow);
      }
    }

    return consensusRows;
  }

  /**
   * Find best matching row between vendor results
   */
  private findBestMatch(target: OCRRow, candidates: OCRRow[]): OCRRow | null {
    let bestMatch: OCRRow | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = this.calculateRowSimilarity(target, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    return bestScore > 0.3 ? bestMatch : null;
  }

  /**
   * Calculate similarity between two rows
   */
  private calculateRowSimilarity(row1: OCRRow, row2: OCRRow): number {
    let matches = 0;
    let total = 0;

    // Compare code
    if (row1.code || row2.code) {
      total++;
      if (row1.code === row2.code) matches++;
    }

    // Compare description (fuzzy)
    if (row1.description || row2.description) {
      total++;
      if (row1.description && row2.description) {
        const similarity = this.stringSimilarity(row1.description, row2.description);
        if (similarity > 0.7) matches++;
      }
    }

    // Compare amounts
    if (row1.charge || row2.charge) {
      total++;
      if (row1.charge === row2.charge) matches++;
    }

    return total > 0 ? matches / total : 0;
  }

  /**
   * Simple string similarity
   */
  private stringSimilarity(str1: string, str2: string): number {
    const a = str1.toLowerCase();
    const b = str2.toLowerCase();

    if (a === b) return 1;

    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Levenshtein distance for string comparison
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate consensus score between two vendor results
   */
  private calculateConsensusScore(row1: OCRRow, row2: OCRRow | null): number {
    if (!row2) return 0.5; // Single vendor

    return this.calculateRowSimilarity(row1, row2);
  }

  /**
   * Run deterministic validators on row data
   */
  private runValidators(row1: OCRRow, row2: OCRRow | null): any {
    const validators = {
      regex_pass: true,
      code_valid: true,
      date_valid: true,
      money_valid: true,
      npi_valid: true,
      row_has_money: false
    };

    // Validate CPT codes
    if (row1.code) {
      validators.code_valid = this.validateCPTCode(row1.code);
      validators.regex_pass = validators.regex_pass && validators.code_valid;
    }

    // Validate dates
    if (row1.dos) {
      validators.date_valid = this.validateDate(row1.dos);
      validators.regex_pass = validators.regex_pass && validators.date_valid;
    }

    // Validate money fields
    const moneyFields = [row1.charge, row1.allowed, row1.plan_paid, row1.patient_resp];
    validators.row_has_money = moneyFields.some(field => field && this.validateMoney(field));
    validators.money_valid = moneyFields.every(field => !field || this.validateMoney(field));
    validators.regex_pass = validators.regex_pass && validators.money_valid;

    // Validate NPI
    if (row1.npi) {
      validators.npi_valid = /^\d{10}$/.test(row1.npi);
      validators.regex_pass = validators.regex_pass && validators.npi_valid;
    }

    return validators;
  }

  /**
   * Validate CPT/HCPCS codes
   */
  private validateCPTCode(code: string): boolean {
    // CPT: 5 digits
    if (/^\d{5}$/.test(code)) {
      // Reject if looks like date or ID
      if (/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(code) || /^[12]\d{4}$/.test(code)) {
        return false;
      }
      return true;
    }

    // HCPCS: Letter + 4 digits
    if (/^[A-Z]\d{4}$/.test(code)) {
      return true;
    }

    return false;
  }

  /**
   * Validate date format
   */
  private validateDate(dateStr: string): boolean {
    // MM/DD/YYYY or YYYY-MM-DD
    return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr) || /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  }

  /**
   * Validate money format
   */
  private validateMoney(moneyStr: string): boolean {
    return /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/.test(moneyStr);
  }

  /**
   * Get consensus field value
   */
  private getConsensusField<T>(v1: T, v2: T | undefined, isValid: boolean): T | null {
    if (!isValid) return null;

    if (v1 === v2) return v1;
    if (v1 && !v2) return v1;
    if (!v1 && v2) return v2;

    // If different, prefer v1 (primary vendor)
    return v1 || null;
  }

  /**
   * Parse date string to Date object
   */
  private parseDate(dateStr: string | null): Date | null {
    if (!dateStr) return null;

    try {
      // Handle MM/DD/YYYY format
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const [month, day, year] = dateStr.split('/');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }

      // Handle YYYY-MM-DD format
      return new Date(dateStr);
    } catch {
      return null;
    }
  }

  /**
   * Parse money string to cents
   */
  private parseMoney(moneyStr: string | null): number | null {
    if (!moneyStr) return null;

    try {
      const cleaned = moneyStr.replace(/[$,]/g, '');
      const amount = parseFloat(cleaned);
      return Math.round(amount * 100);
    } catch {
      return null;
    }
  }

  /**
   * Persist consensus results to Supabase
   */
  private async persistToSupabase(
    caseId: string,
    artifactId: string,
    artifactDigest: string,
    rows: Array<any>
  ): Promise<void> {
    console.log(`💾 Persisting ${rows.length} rows to Supabase`);

    // Prepare rows for insertion
    const dbRows = rows.map(row => ({
      case_id: caseId,
      artifact_id: artifactId,
      artifact_digest: artifactDigest,
      page: row.page,
      row_idx: row.row_idx,
      doc_type: row.doc_type,
      code: row.code,
      code_system: row.code_system,
      modifiers: row.modifiers,
      description: row.description,
      units: row.units,
      dos: row.dos,
      pos: row.pos,
      rev_code: row.rev_code,
      npi: row.npi,
      charge_cents: row.charge_cents,
      allowed_cents: row.allowed_cents,
      plan_paid_cents: row.plan_paid_cents,
      patient_resp_cents: row.patient_resp_cents,
      keyfacts: row.keyfacts,
      low_conf: row.low_conf,
      vendor_consensus: row.vendor_consensus,
      validators: row.validators,
      bbox: row.bbox,
      conf: row.conf
    }));

    // Insert into ocr_extractions table
    const { error } = await supabase
      .from('ocr_extractions')
      .insert(dbRows);

    if (error) {
      console.error('❌ Failed to persist to Supabase:', error);
      throw new Error(`Failed to persist OCR results: ${error.message}`);
    }

    console.log('✅ Successfully persisted OCR results to Supabase');
  }
}