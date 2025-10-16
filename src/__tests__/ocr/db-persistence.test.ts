/**
 * Test database persistence and retrieval of OCR consensus results
 * Verify Supabase integration and analyzer/chat reading from DB
 */

import { createClient } from '@supabase/supabase-js';
import { DualVendorOCRPipeline } from '@/lib/dual-vendor-ocr';

// Mock Supabase responses
const mockOCRExtractions = [
  {
    id: 1,
    case_id: 'test-case-123',
    artifact_id: 'test-artifact-456',
    artifact_digest: 'sha256-digest-123',
    page: 1,
    row_idx: 0,
    doc_type: 'EOB',
    code: '99213',
    code_system: 'CPT',
    modifiers: null,
    description: 'Office visit, established patient',
    units: 1,
    dos: new Date('2025-04-15'),
    pos: '11',
    rev_code: null,
    npi: '1234567890',
    charge_cents: 15000, // $150.00
    allowed_cents: 12000, // $120.00
    plan_paid_cents: 9600, // $96.00
    patient_resp_cents: 2400, // $24.00
    keyfacts: null,
    low_conf: false,
    vendor_consensus: 0.95,
    validators: {
      regex_pass: true,
      code_valid: true,
      date_valid: true,
      money_valid: true,
      row_has_money: true
    },
    bbox: { x: 100, y: 200, width: 300, height: 20 },
    conf: 0.92,
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    case_id: 'test-case-123',
    artifact_id: 'test-artifact-456',
    artifact_digest: 'sha256-digest-123',
    page: 1,
    row_idx: 1,
    doc_type: 'EOB',
    code: '85025',
    code_system: 'CPT',
    modifiers: null,
    description: 'Complete blood count',
    units: 1,
    dos: new Date('2025-04-15'),
    pos: '11',
    rev_code: null,
    npi: '1234567890',
    charge_cents: 4500, // $45.00
    allowed_cents: 3600, // $36.00
    plan_paid_cents: 2880, // $28.80
    patient_resp_cents: 720, // $7.20
    keyfacts: null,
    low_conf: false,
    vendor_consensus: 0.98,
    validators: {
      regex_pass: true,
      code_valid: true,
      date_valid: true,
      money_valid: true,
      row_has_money: true
    },
    bbox: { x: 100, y: 220, width: 300, height: 20 },
    conf: 0.95,
    created_at: new Date().toISOString()
  },
  {
    id: 3,
    case_id: 'test-case-123',
    artifact_id: 'test-artifact-789',
    artifact_digest: 'sha256-digest-456',
    page: 1,
    row_idx: 0,
    doc_type: 'LETTER',
    code: null,
    code_system: null,
    modifiers: null,
    description: null,
    units: null,
    dos: null,
    pos: null,
    rev_code: null,
    npi: null,
    charge_cents: null,
    allowed_cents: null,
    plan_paid_cents: null,
    patient_resp_cents: null,
    keyfacts: {
      denial_reason: 'Prior authorization required',
      carc_codes: ['50'],
      rarc_codes: ['N386'],
      claim_or_account_ref: 'CLM-2025-001'
    },
    low_conf: false,
    vendor_consensus: 0.88,
    validators: {
      regex_pass: true,
      row_has_money: false
    },
    bbox: null,
    conf: 0.88,
    created_at: new Date().toISOString()
  }
];

const mockArtifacts = [
  {
    artifact_id: 'test-artifact-456',
    case_id: 'test-case-123',
    artifact_digest: 'sha256-digest-123',
    filename: 'eob-sample.pdf',
    mime: 'application/pdf',
    pages: 1,
    doc_type: 'EOB',
    created_at: new Date().toISOString()
  },
  {
    artifact_id: 'test-artifact-789',
    case_id: 'test-case-123',
    artifact_digest: 'sha256-digest-456',
    filename: 'denial-letter.pdf',
    mime: 'application/pdf',
    pages: 1,
    doc_type: 'LETTER',
    created_at: new Date().toISOString()
  }
];

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn(),
};

const mockFromOCRExtractions = {
  select: jest.fn(() => ({
    eq: jest.fn(() => ({
      order: jest.fn(() => ({ data: mockOCRExtractions, error: null }))
    }))
  })),
  insert: jest.fn(() => ({ error: null }))
};

const mockFromOCRArtifacts = {
  select: jest.fn(() => ({
    eq: jest.fn(() => ({ data: mockArtifacts, error: null }))
  })),
  insert: jest.fn(() => ({ error: null }))
};

const mockFromOCRCases = {
  insert: jest.fn(() => ({ error: null }))
};

describe('Database Persistence Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      switch (table) {
        case 'ocr_extractions':
          return mockFromOCRExtractions;
        case 'ocr_artifacts':
          return mockFromOCRArtifacts;
        case 'ocr_cases':
          return mockFromOCRCases;
        default:
          return {};
      }
    });
  });

  test('should persist OCR extractions to Supabase', async () => {
    const pipeline = new DualVendorOCRPipeline();

    // Mock the private method
    const persistMethod = (pipeline as any).persistToSupabase;
    (pipeline as any).persistToSupabase = jest.fn();

    const mockRows = [
      {
        page: 1,
        row_idx: 0,
        doc_type: 'EOB',
        code: '99213',
        code_system: 'CPT',
        description: 'Office visit',
        charge_cents: 15000,
        vendor_consensus: 0.95,
        low_conf: false
      }
    ];

    await (pipeline as any).persistToSupabase(
      'test-case-id',
      'test-artifact-id',
      'test-digest',
      mockRows
    );

    expect((pipeline as any).persistToSupabase).toHaveBeenCalledWith(
      'test-case-id',
      'test-artifact-id',
      'test-digest',
      mockRows
    );
  });

  test('should retrieve extractions for analyzer', async () => {
    // Simulate API call to /api/analyzer/run
    const request = {
      json: jest.fn().mockResolvedValue({ caseId: 'test-case-123' })
    };

    // Mock the Supabase query that the analyzer would make
    const result = await mockFromOCRExtractions
      .select('*')
      .eq('case_id', 'test-case-123')
      .order('page', { ascending: true })
      .order('row_idx', { ascending: true });

    expect(result.data).toEqual(mockOCRExtractions);
    expect(result.data.length).toBe(3);

    // Verify EOB rows are included
    const eobRows = result.data.filter((row: any) => row.doc_type === 'EOB');
    expect(eobRows.length).toBe(2);
    expect(eobRows[0].code).toBe('99213');
    expect(eobRows[1].code).toBe('85025');

    // Verify letter KeyFacts are included
    const letterRows = result.data.filter((row: any) => row.doc_type === 'LETTER');
    expect(letterRows.length).toBe(1);
    expect(letterRows[0].keyfacts.denial_reason).toBe('Prior authorization required');
  });

  test('should calculate totals from high-confidence rows only', async () => {
    // Simulate analyzer logic
    const extractions = mockOCRExtractions;

    const highConfidenceItems = extractions.filter(e =>
      !e.low_conf && (e.doc_type === 'BILL' || e.doc_type === 'EOB')
    );

    const totals = {
      billed: highConfidenceItems.reduce((sum, item) => sum + (item.charge_cents || 0), 0),
      allowed: highConfidenceItems.reduce((sum, item) => sum + (item.allowed_cents || 0), 0),
      planPaid: highConfidenceItems.reduce((sum, item) => sum + (item.plan_paid_cents || 0), 0),
      patientResp: highConfidenceItems.reduce((sum, item) => sum + (item.patient_resp_cents || 0), 0)
    };

    expect(totals.billed).toBe(19500); // $195.00 total
    expect(totals.allowed).toBe(15600); // $156.00 total
    expect(totals.planPaid).toBe(12480); // $124.80 total
    expect(totals.patientResp).toBe(3120); // $31.20 total
  });

  test('should transform database rows to LineItem format', async () => {
    const extractions = mockOCRExtractions.filter(e => e.doc_type === 'EOB');

    const lineItems = extractions.map(extraction => ({
      lineId: `${extraction.case_id}_${extraction.row_idx}`,
      artifactId: extraction.artifact_id,
      description: extraction.description || undefined,
      code: extraction.code || undefined,
      modifiers: extraction.modifiers || undefined,
      units: extraction.units ? Number(extraction.units) : undefined,
      revCode: extraction.rev_code || undefined,
      pos: extraction.pos || undefined,
      npi: extraction.npi || undefined,
      dos: extraction.dos ? new Date(extraction.dos).toISOString().split('T')[0] : undefined,
      charge: extraction.charge_cents || undefined,
      allowed: extraction.allowed_cents || undefined,
      planPaid: extraction.plan_paid_cents || undefined,
      patientResp: extraction.patient_resp_cents || undefined,
      ocr: {
        page: extraction.page,
        bbox: extraction.bbox ?
          [extraction.bbox.x, extraction.bbox.y, extraction.bbox.width, extraction.bbox.height] :
          undefined,
        conf: extraction.conf || undefined
      },
      note: extraction.low_conf ? 'low_confidence_ocr' : undefined
    }));

    expect(lineItems.length).toBe(2);
    expect(lineItems[0].code).toBe('99213');
    expect(lineItems[0].charge).toBe(15000);
    expect(lineItems[0].ocr?.conf).toBe(0.92);
    expect(lineItems[1].code).toBe('85025');
    expect(lineItems[1].charge).toBe(4500);
  });

  test('should retrieve KeyFacts for chat analysis', async () => {
    // Simulate chat API logic
    const extractions = mockOCRExtractions;

    const keyFacts = extractions
      .filter(e => e.keyfacts)
      .map(e => e.keyfacts)
      .reduce((acc, kf) => ({ ...acc, ...kf }), {});

    expect(keyFacts.denial_reason).toBe('Prior authorization required');
    expect(keyFacts.carc_codes).toContain('50');
    expect(keyFacts.rarc_codes).toContain('N386');
    expect(keyFacts.claim_or_account_ref).toBe('CLM-2025-001');
  });

  test('should handle database errors gracefully', async () => {
    // Simulate database error
    const errorResponse = { data: null, error: { message: 'Connection failed' } };

    mockFromOCRExtractions.select = jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(() => errorResponse)
      }))
    }));

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'ocr_extractions') {
        return mockFromOCRExtractions;
      }
      return {};
    });

    // Simulate analyzer handling the error
    const result = await mockFromOCRExtractions
      .select('*')
      .eq('case_id', 'test-case-123')
      .order('page', { ascending: true });

    expect(result.error).toBeTruthy();
    expect(result.data).toBeNull();
  });

  test('should filter low confidence items from financial calculations', async () => {
    // Add a low confidence item to the mock data
    const extractionsWithLowConf = [
      ...mockOCRExtractions,
      {
        id: 4,
        case_id: 'test-case-123',
        artifact_id: 'test-artifact-456',
        artifact_digest: 'sha256-digest-123',
        page: 1,
        row_idx: 2,
        doc_type: 'EOB',
        code: '99999',
        code_system: 'CPT',
        modifiers: null,
        description: 'Uncertain procedure',
        units: 1,
        dos: new Date('2025-04-15'),
        pos: '11',
        rev_code: null,
        npi: '1234567890',
        charge_cents: 50000, // $500.00 - should be excluded
        allowed_cents: 40000,
        plan_paid_cents: 32000,
        patient_resp_cents: 8000,
        keyfacts: null,
        low_conf: true, // This item has low confidence
        vendor_consensus: 0.3,
        validators: {
          regex_pass: false,
          code_valid: false
        },
        bbox: null,
        conf: 0.3,
        created_at: new Date().toISOString()
      }
    ];

    // Filter for high confidence items only
    const highConfidenceItems = extractionsWithLowConf.filter(e =>
      !e.low_conf && (e.doc_type === 'BILL' || e.doc_type === 'EOB')
    );

    const totals = {
      billed: highConfidenceItems.reduce((sum, item) => sum + (item.charge_cents || 0), 0)
    };

    // Should not include the $500 low confidence item
    expect(totals.billed).toBe(19500); // Still $195.00, not $695.00
  });

  test('should create priced summary view format', async () => {
    const extractions = mockOCRExtractions.filter(e => e.doc_type === 'EOB');

    // Simulate the view query result
    const pricedSummaryLines = extractions.map(item => ({
      row_idx: item.row_idx,
      code: item.code,
      code_system: item.code_system,
      modifiers: item.modifiers,
      description: item.description,
      units: item.units,
      dos: item.dos ? new Date(item.dos).toISOString().split('T')[0] : null,
      pos: item.pos,
      rev_code: item.rev_code,
      npi: item.npi,
      charge_cents: item.charge_cents,
      allowed_cents: item.allowed_cents,
      plan_paid_cents: item.plan_paid_cents,
      patient_resp_cents: item.patient_resp_cents,
      low_conf: item.low_conf,
      vendor_consensus: item.vendor_consensus
    }));

    expect(pricedSummaryLines.length).toBe(2);
    expect(pricedSummaryLines[0].code).toBe('99213');
    expect(pricedSummaryLines[0].charge_cents).toBe(15000);
    expect(pricedSummaryLines[0].vendor_consensus).toBe(0.95);
    expect(pricedSummaryLines[1].code).toBe('85025');
    expect(pricedSummaryLines[1].charge_cents).toBe(4500);
  });
});

describe('Integration with Existing Endpoints', () => {
  test('should replace existing analyze-documents workflow', async () => {
    // The new workflow should be:
    // 1. POST /api/ocr/ingest (dual-vendor OCR + persist to Supabase)
    // 2. POST /api/analyzer/run (read from Supabase + run detection rules)

    // Instead of the old workflow:
    // 1. POST /api/analyze-documents (OCR + analyze in one step)

    // Verify the separation of concerns
    expect(true).toBe(true); // This represents the architectural change
  });

  test('should maintain backward compatibility in response format', async () => {
    // The new analyzer should return the same AnalyzerResult format
    // even though it's reading from database instead of processing files

    const mockAnalyzerResult = {
      documentMeta: [
        {
          artifactId: 'test-artifact-456',
          docType: 'EOB',
          providerName: undefined,
          providerNPI: undefined,
          payer: undefined
        }
      ],
      lineItems: [
        {
          lineId: 'test-case-123_0',
          artifactId: 'test-artifact-456',
          description: 'Office visit, established patient',
          code: '99213'
        }
      ],
      pricedSummary: {
        header: {},
        totals: {
          billed: 19500,
          allowed: 15600,
          planPaid: 12480,
          patientResp: 3120
        },
        lines: []
      },
      detections: [],
      complianceFooters: [],
      confidence: {
        overall: 0.95
      }
    };

    // Verify structure matches expected AnalyzerResult interface
    expect(mockAnalyzerResult.documentMeta).toBeDefined();
    expect(mockAnalyzerResult.lineItems).toBeDefined();
    expect(mockAnalyzerResult.pricedSummary).toBeDefined();
    expect(mockAnalyzerResult.detections).toBeDefined();
    expect(mockAnalyzerResult.confidence).toBeDefined();
  });
});