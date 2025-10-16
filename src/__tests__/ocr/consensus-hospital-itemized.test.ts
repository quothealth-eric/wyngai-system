/**
 * Test dual-vendor OCR consensus on hospital itemized bill
 * Should extract lab/room/pharmacy codes without hallucinating 99213
 */

import { DualVendorOCRPipeline } from '@/lib/dual-vendor-ocr';

// Mock vendor responses for hospital bill
const mockOpenAIResponse = {
  doc_type: 'BILL' as const,
  header: {
    provider_name: 'Good Samaritan Hospital',
    provider_npi: '1234567890',
    payer: 'Blue Cross Blue Shield',
    claim_id: 'HSP-2025-001234',
    account_id: 'ACC-567890',
    service_dates: { start: '2025-04-08', end: '2025-04-11' },
    page: 1,
    artifact_digest: 'test-digest-123'
  },
  totals: {
    billed: '$12,450.75',
    allowed: '$8,920.50',
    plan_paid: '$7,136.40',
    patient_resp: '$1,784.10'
  },
  rows: [
    {
      code: '85025',
      code_system: 'CPT' as const,
      description: 'Complete Blood Count (CBC)',
      charge: '$45.00',
      allowed: '$32.15',
      plan_paid: '$25.72',
      patient_resp: '$6.43',
      dos: '2025-04-08'
    },
    {
      code: '80053',
      code_system: 'CPT' as const,
      description: 'Comprehensive Metabolic Panel',
      charge: '$65.00',
      allowed: '$46.50',
      plan_paid: '$37.20',
      patient_resp: '$9.30',
      dos: '2025-04-08'
    },
    {
      code: 'A9150',
      code_system: 'HCPCS' as const,
      description: 'Non-radioactive contrast imaging material',
      charge: '$150.00',
      allowed: '$120.00',
      plan_paid: '$96.00',
      patient_resp: '$24.00',
      dos: '2025-04-09'
    },
    {
      code: 'J1200',
      code_system: 'HCPCS' as const,
      description: 'Injection, diphenhydramine HCl',
      charge: '$25.00',
      allowed: '$20.00',
      plan_paid: '$16.00',
      patient_resp: '$4.00',
      dos: '2025-04-09'
    },
    {
      code: null,
      code_system: null,
      description: 'SEMI-PRIVATE ROOM 02491',
      charge: '$450.00',
      allowed: '$350.00',
      plan_paid: '$280.00',
      patient_resp: '$70.00',
      dos: '2025-04-08'
    },
    {
      code: null,
      code_system: null,
      description: 'SEMI-PRIVATE ROOM 02492',
      charge: '$450.00',
      allowed: '$350.00',
      plan_paid: '$280.00',
      patient_resp: '$70.00',
      dos: '2025-04-09'
    }
  ],
  keyfacts: {}
};

const mockAnthropicResponse = {
  doc_type: 'BILL' as const,
  header: {
    provider_name: 'Good Samaritan Hospital',
    provider_npi: '1234567890',
    payer: 'Blue Cross Blue Shield',
    claim_id: 'HSP-2025-001234',
    account_id: 'ACC-567890',
    service_dates: { start: '2025-04-08', end: '2025-04-11' },
    page: 1,
    artifact_digest: 'test-digest-123'
  },
  totals: {
    billed: '$12,450.75',
    allowed: '$8,920.50',
    plan_paid: '$7,136.40',
    patient_resp: '$1,784.10'
  },
  rows: [
    {
      code: '85025',
      code_system: 'CPT' as const,
      description: 'Complete Blood Count',
      charge: '$45.00',
      allowed: '$32.15',
      plan_paid: '$25.72',
      patient_resp: '$6.43',
      dos: '2025-04-08'
    },
    {
      code: '80053',
      code_system: 'CPT' as const,
      description: 'Comprehensive Metabolic Panel',
      charge: '$65.00',
      allowed: '$46.50',
      plan_paid: '$37.20',
      patient_resp: '$9.30',
      dos: '2025-04-08'
    },
    {
      code: 'A9150',
      code_system: 'HCPCS' as const,
      description: 'Contrast material',
      charge: '$150.00',
      allowed: '$120.00',
      plan_paid: '$96.00',
      patient_resp: '$24.00',
      dos: '2025-04-09'
    },
    {
      code: 'J1200',
      code_system: 'HCPCS' as const,
      description: 'Diphenhydramine injection',
      charge: '$25.00',
      allowed: '$20.00',
      plan_paid: '$16.00',
      patient_resp: '$4.00',
      dos: '2025-04-09'
    },
    {
      code: null,
      code_system: null,
      description: 'Room charge - semi-private',
      charge: '$900.00', // Different total for room charges
      allowed: '$700.00',
      plan_paid: '$560.00',
      patient_resp: '$140.00',
      dos: '2025-04-08'
    }
  ],
  keyfacts: {}
};

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({ error: null }))
  }))
};

// Mock vendor API calls
const mockCallOpenAIVision = jest.fn();
const mockCallAnthropicVision = jest.fn();

describe('OCR Consensus - Hospital Itemized Bill', () => {
  let pipeline: DualVendorOCRPipeline;

  beforeEach(() => {
    jest.clearAllMocks();
    pipeline = new DualVendorOCRPipeline();

    // Mock the private methods
    (pipeline as any).callOpenAIVision = mockCallOpenAIVision;
    (pipeline as any).callAnthropicVision = mockCallAnthropicVision;
    (pipeline as any).persistToSupabase = jest.fn();

    mockCallOpenAIVision.mockResolvedValue(mockOpenAIResponse);
    mockCallAnthropicVision.mockResolvedValue(mockAnthropicResponse);
  });

  test('should extract legitimate lab codes without hallucinating 99213', async () => {
    const testBuffer = Buffer.from('mock-hospital-bill-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'hospital-bill.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Should extract legitimate codes
    const extractedCodes = result.extractedRows
      .filter(row => row.code)
      .map(row => row.code);

    expect(extractedCodes).toContain('85025'); // CBC
    expect(extractedCodes).toContain('80053'); // CMP
    expect(extractedCodes).toContain('A9150'); // Contrast
    expect(extractedCodes).toContain('J1200'); // Injection

    // CRITICAL: Should NOT contain 99213
    expect(extractedCodes).not.toContain('99213');
  });

  test('should handle unstructured room charges without codes', async () => {
    const testBuffer = Buffer.from('mock-hospital-bill-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'hospital-bill.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Should have room charges without codes
    const roomCharges = result.extractedRows
      .filter(row => row.description?.includes('ROOM') || row.description?.includes('SEMI-PRIV'));

    expect(roomCharges.length).toBeGreaterThan(0);
    expect(roomCharges.every(charge => !charge.code)).toBe(true);
  });

  test('should achieve vendor consensus on matching fields', async () => {
    const testBuffer = Buffer.from('mock-hospital-bill-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'hospital-bill.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Items that both vendors agree on should have high consensus
    const cbcRow = result.extractedRows.find(row => row.code === '85025');
    expect(cbcRow?.vendor_consensus).toBeGreaterThan(0.8);

    const cmpRow = result.extractedRows.find(row => row.code === '80053');
    expect(cmpRow?.vendor_consensus).toBeGreaterThan(0.8);
  });

  test('should handle vendor disagreement gracefully', async () => {
    // Modify Anthropic response to disagree on room charges
    const modifiedAnthropicResponse = {
      ...mockAnthropicResponse,
      rows: mockAnthropicResponse.rows.slice(0, 4) // Remove room charges
    };

    mockCallAnthropicVision.mockResolvedValue(modifiedAnthropicResponse);

    const testBuffer = Buffer.from('mock-hospital-bill-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'hospital-bill.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Should still extract agreed-upon items
    const extractedCodes = result.extractedRows
      .filter(row => row.code)
      .map(row => row.code);

    expect(extractedCodes).toContain('85025');
    expect(extractedCodes).toContain('80053');
    expect(extractedCodes).toContain('A9150');
    expect(extractedCodes).toContain('J1200');
  });

  test('should validate CPT codes strictly', async () => {
    // Test with invalid CPT code that looks like a date
    const invalidResponse = {
      ...mockOpenAIResponse,
      rows: [
        ...mockOpenAIResponse.rows,
        {
          code: '01234', // Looks like date
          code_system: 'CPT' as const,
          description: 'Invalid code',
          charge: '$100.00',
          dos: '2025-04-08'
        }
      ]
    };

    mockCallOpenAIVision.mockResolvedValue(invalidResponse);

    const testBuffer = Buffer.from('mock-hospital-bill-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'hospital-bill.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Invalid code should be filtered out
    const extractedCodes = result.extractedRows
      .filter(row => row.code)
      .map(row => row.code);

    expect(extractedCodes).not.toContain('01234');
  });

  test('should calculate totals over $10,000', async () => {
    const testBuffer = Buffer.from('mock-hospital-bill-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'hospital-bill.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Calculate total charges from extracted rows
    const totalCharges = result.extractedRows
      .filter(row => row.charge_cents)
      .reduce((sum, row) => sum + (row.charge_cents || 0), 0);

    // Should be over $10,000 (1,000,000 cents)
    expect(totalCharges).toBeGreaterThan(1000000);
  });

  test('should handle service dates in April 2025 range', async () => {
    const testBuffer = Buffer.from('mock-hospital-bill-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'hospital-bill.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    const serviceDates = result.extractedRows
      .filter(row => row.dos)
      .map(row => row.dos);

    // All dates should be in April 2025
    serviceDates.forEach(date => {
      expect(date?.getFullYear()).toBe(2025);
      expect(date?.getMonth()).toBe(3); // April (0-indexed)
      expect(date?.getDate()).toBeGreaterThanOrEqual(8);
      expect(date?.getDate()).toBeLessThanOrEqual(11);
    });
  });

  test('should mark low confidence items appropriately', async () => {
    // Simulate low consensus scenario
    const lowConsensusResponse = {
      ...mockAnthropicResponse,
      rows: [
        {
          code: '99999', // Completely different code
          code_system: 'CPT' as const,
          description: 'Unknown procedure',
          charge: '$999.00',
          dos: '2025-04-08'
        }
      ]
    };

    mockCallAnthropicVision.mockResolvedValue(lowConsensusResponse);

    const testBuffer = Buffer.from('mock-hospital-bill-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'hospital-bill.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Should have some low confidence items due to disagreement
    const lowConfItems = result.extractedRows.filter(row => row.low_conf);
    expect(lowConfItems.length).toBeGreaterThan(0);
  });
});

describe('OCR Consensus - Vendor Fallback', () => {
  let pipeline: DualVendorOCRPipeline;

  beforeEach(() => {
    jest.clearAllMocks();
    pipeline = new DualVendorOCRPipeline();
    (pipeline as any).persistToSupabase = jest.fn();
  });

  test('should handle OpenAI failure gracefully', async () => {
    (pipeline as any).callOpenAIVision = jest.fn().mockRejectedValue(new Error('OpenAI API error'));
    (pipeline as any).callAnthropicVision = jest.fn().mockResolvedValue(mockAnthropicResponse);

    const testBuffer = Buffer.from('mock-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'test.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Should still process with Anthropic data
    expect(result.extractedRows.length).toBeGreaterThan(0);
  });

  test('should handle Anthropic failure gracefully', async () => {
    (pipeline as any).callOpenAIVision = jest.fn().mockResolvedValue(mockOpenAIResponse);
    (pipeline as any).callAnthropicVision = jest.fn().mockRejectedValue(new Error('Anthropic API error'));

    const testBuffer = Buffer.from('mock-image');
    const result = await pipeline.processDocument(
      testBuffer,
      'test.pdf',
      'application/pdf',
      'test-case-id',
      'test-artifact-id'
    );

    // Should still process with OpenAI data
    expect(result.extractedRows.length).toBeGreaterThan(0);
  });

  test('should fail when both vendors fail', async () => {
    (pipeline as any).callOpenAIVision = jest.fn().mockRejectedValue(new Error('OpenAI API error'));
    (pipeline as any).callAnthropicVision = jest.fn().mockRejectedValue(new Error('Anthropic API error'));

    const testBuffer = Buffer.from('mock-image');

    await expect(
      pipeline.processDocument(
        testBuffer,
        'test.pdf',
        'application/pdf',
        'test-case-id',
        'test-artifact-id'
      )
    ).rejects.toThrow('Both OCR vendors failed');
  });
});