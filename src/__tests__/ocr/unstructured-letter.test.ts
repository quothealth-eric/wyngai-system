/**
 * Test dual-vendor OCR consensus on unstructured documents (denial letters, insurance cards)
 * Should extract KeyFacts without creating fake service lines
 */

import { DualVendorOCRPipeline } from '@/lib/dual-vendor-ocr';

// Mock vendor responses for denial letter
const mockDenialLetterOpenAI = {
  doc_type: 'LETTER' as const,
  header: {
    provider_name: null,
    provider_npi: null,
    payer: 'Aetna',
    claim_id: 'CLM-2025-456789',
    account_id: null,
    service_dates: null,
    page: 1,
    artifact_digest: 'test-letter-digest'
  },
  totals: {},
  rows: [], // No service rows for denial letter
  keyfacts: {
    denial_reason: 'Services not medically necessary',
    carc_codes: ['50', '96'],
    rarc_codes: ['N386'],
    auth_or_referral: 'Prior authorization required',
    claim_or_account_ref: 'CLM-2025-456789'
  }
};

const mockDenialLetterAnthropic = {
  doc_type: 'LETTER' as const,
  header: {
    provider_name: null,
    provider_npi: null,
    payer: 'Aetna Insurance',
    claim_id: 'CLM-2025-456789',
    account_id: null,
    service_dates: null,
    page: 1,
    artifact_digest: 'test-letter-digest'
  },
  totals: {},
  rows: [], // No service rows for denial letter
  keyfacts: {
    denial_reason: 'Medical necessity not established',
    carc_codes: ['50', '96'],
    rarc_codes: ['N386'],
    auth_or_referral: 'Prior authorization was required but not obtained',
    claim_or_account_ref: 'CLM-2025-456789'
  }
};

// Mock vendor responses for insurance card
const mockInsuranceCardOpenAI = {
  doc_type: 'INSURANCE_CARD' as const,
  header: {
    provider_name: null,
    provider_npi: null,
    payer: 'Blue Cross Blue Shield',
    claim_id: null,
    account_id: null,
    service_dates: null,
    page: 1,
    artifact_digest: 'test-card-digest'
  },
  totals: {},
  rows: [], // No service rows for insurance card
  keyfacts: {
    bin: '610014',
    pcn: 'BCBS',
    grp: 'GRP123456',
    member_id_masked: '****-****-1234'
  }
};

const mockInsuranceCardAnthropic = {
  doc_type: 'INSURANCE_CARD' as const,
  header: {
    provider_name: null,
    provider_npi: null,
    payer: 'BCBS',
    claim_id: null,
    account_id: null,
    service_dates: null,
    page: 1,
    artifact_digest: 'test-card-digest'
  },
  totals: {},
  rows: [], // No service rows for insurance card
  keyfacts: {
    bin: '610014',
    pcn: 'BCBS',
    grp: 'GRP123456',
    member_id_masked: '****-****-1234'
  }
};

describe('OCR Consensus - Unstructured Denial Letter', () => {
  let pipeline: DualVendorOCRPipeline;

  beforeEach(() => {
    jest.clearAllMocks();
    pipeline = new DualVendorOCRPipeline();

    (pipeline as any).callOpenAIVision = jest.fn().mockResolvedValue(mockDenialLetterOpenAI);
    (pipeline as any).callAnthropicVision = jest.fn().mockResolvedValue(mockDenialLetterAnthropic);
    (pipeline as any).persistToSupabase = jest.fn();
  });

  test('should extract denial reason from letter', async () => {
    const testBuffer = Buffer.from('mock-denial-letter-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'denial-letter.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Should extract KeyFacts with denial reason
    const keyFactsRow = result.extractedRows.find(row => row.keyfacts?.denial_reason);
    expect(keyFactsRow).toBeDefined();
    expect(keyFactsRow?.keyfacts.denial_reason).toContain('medically necessary');
  });

  test('should extract CARC and RARC codes', async () => {
    const testBuffer = Buffer.from('mock-denial-letter-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'denial-letter.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    const keyFactsRow = result.extractedRows.find(row => row.keyfacts?.carc_codes);
    expect(keyFactsRow?.keyfacts.carc_codes).toContain('50');
    expect(keyFactsRow?.keyfacts.carc_codes).toContain('96');
    expect(keyFactsRow?.keyfacts.rarc_codes).toContain('N386');
  });

  test('should NOT create fake service lines for denial letter', async () => {
    const testBuffer = Buffer.from('mock-denial-letter-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'denial-letter.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Should have no service line items with codes/charges
    const serviceLines = result.extractedRows.filter(row =>
      row.code || row.charge_cents || row.allowed_cents
    );

    expect(serviceLines.length).toBe(0);
  });

  test('should identify document type as LETTER', async () => {
    const testBuffer = Buffer.from('mock-denial-letter-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'denial-letter.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    expect(result.extractedRows[0]?.doc_type).toBe('LETTER');
  });

  test('should handle vendor consensus on KeyFacts', async () => {
    const testBuffer = Buffer.from('mock-denial-letter-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'denial-letter.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // CARC codes should have high consensus (both vendors agree)
    const keyFactsRow = result.extractedRows.find(row => row.keyfacts?.carc_codes);
    expect(keyFactsRow?.vendor_consensus).toBeGreaterThan(0.8);
  });
});

describe('OCR Consensus - Insurance Card', () => {
  let pipeline: DualVendorOCRPipeline;

  beforeEach(() => {
    jest.clearAllMocks();
    pipeline = new DualVendorOCRPipeline();

    (pipeline as any).callOpenAIVision = jest.fn().mockResolvedValue(mockInsuranceCardOpenAI);
    (pipeline as any).callAnthropicVision = jest.fn().mockResolvedValue(mockInsuranceCardAnthropic);
    (pipeline as any).persistToSupabase = jest.fn();
  });

  test('should extract BIN, PCN, and GRP from insurance card', async () => {
    const testBuffer = Buffer.from('mock-insurance-card-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'insurance-card.jpg',
      'image/jpeg',
      'test-case-id',
      'test-artifact-id'
    );

    const keyFactsRow = result.extractedRows.find(row => row.keyfacts?.bin);
    expect(keyFactsRow?.keyfacts.bin).toBe('610014');
    expect(keyFactsRow?.keyfacts.pcn).toBe('BCBS');
    expect(keyFactsRow?.keyfacts.grp).toBe('GRP123456');
  });

  test('should mask member ID for privacy', async () => {
    const testBuffer = Buffer.from('mock-insurance-card-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'insurance-card.jpg',
      'image/jpeg',
      'test-case-id',
      'test-artifact-id'
    );

    const keyFactsRow = result.extractedRows.find(row => row.keyfacts?.member_id_masked);
    expect(keyFactsRow?.keyfacts.member_id_masked).toContain('****');
    expect(keyFactsRow?.keyfacts.member_id_masked).toMatch(/\*{4}-\*{4}-\d{4}/);
  });

  test('should NOT create service lines for insurance card', async () => {
    const testBuffer = Buffer.from('mock-insurance-card-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'insurance-card.jpg',
      'image/jpeg',
      'test-case-id',
      'test-artifact-id'
    );

    // Should have no service line items with codes/charges
    const serviceLines = result.extractedRows.filter(row =>
      row.code || row.charge_cents || row.allowed_cents
    );

    expect(serviceLines.length).toBe(0);
  });

  test('should identify document type as INSURANCE_CARD', async () => {
    const testBuffer = Buffer.from('mock-insurance-card-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'insurance-card.jpg',
      'image/jpeg',
      'test-case-id',
      'test-artifact-id'
    );

    expect(result.extractedRows[0]?.doc_type).toBe('INSURANCE_CARD');
  });
});

describe('OCR Consensus - Mixed Document Scenarios', () => {
  let pipeline: DualVendorOCRPipeline;

  beforeEach(() => {
    jest.clearAllMocks();
    pipeline = new DualVendorOCRPipeline();
    (pipeline as any).persistToSupabase = jest.fn();
  });

  test('should handle vendor disagreement on document type', async () => {
    // OpenAI thinks it's a letter, Anthropic thinks it's portal
    const openAIResponse = {
      ...mockDenialLetterOpenAI,
      doc_type: 'LETTER' as const
    };

    const anthropicResponse = {
      ...mockDenialLetterAnthropic,
      doc_type: 'PORTAL' as const
    };

    (pipeline as any).callOpenAIVision = jest.fn().mockResolvedValue(openAIResponse);
    (pipeline as any).callAnthropicVision = jest.fn().mockResolvedValue(anthropicResponse);

    const testBuffer = Buffer.from('mock-ambiguous-document');
    const result = await pipeline.processDocument(
      testBuffer,
      'ambiguous.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Should use primary vendor's classification (OpenAI in this case)
    expect(result.extractedRows[0]?.doc_type).toBe('LETTER');
  });

  test('should handle no KeyFacts extraction gracefully', async () => {
    const emptyResponse = {
      doc_type: 'UNKNOWN' as const,
      header: {
        provider_name: null,
        provider_npi: null,
        payer: null,
        claim_id: null,
        account_id: null,
        service_dates: null,
        page: 1,
        artifact_digest: 'test-empty-digest'
      },
      totals: {},
      rows: [],
      keyfacts: {}
    };

    (pipeline as any).callOpenAIVision = jest.fn().mockResolvedValue(emptyResponse);
    (pipeline as any).callAnthropicVision = jest.fn().mockResolvedValue(emptyResponse);

    const testBuffer = Buffer.from('mock-empty-document');
    const result = await pipeline.processDocument(
      testBuffer,
      'empty.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Should handle gracefully without crashing
    expect(result.extractedRows.length).toBeGreaterThanOrEqual(0);
  });

  test('should preserve original denial reason context', async () => {
    const testBuffer = Buffer.from('mock-denial-letter-image');

    (pipeline as any).callOpenAIVision = jest.fn().mockResolvedValue(mockDenialLetterOpenAI);
    (pipeline as any).callAnthropicVision = jest.fn().mockResolvedValue(mockDenialLetterAnthropic);

    const result = await pipeline.processDocument(
      testBuffer,
      'denial-letter.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    const keyFactsRow = result.extractedRows.find(row => row.keyfacts?.denial_reason);

    // Should preserve the exact wording from OCR, not synthesize generic text
    expect(keyFactsRow?.keyfacts.denial_reason).toBeTruthy();
    expect(keyFactsRow?.keyfacts.denial_reason.length).toBeGreaterThan(10);
  });
});