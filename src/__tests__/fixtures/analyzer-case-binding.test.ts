/**
 * Test fixtures for analyzer case binding and table-aware extraction
 *
 * REPRO BUG TESTS:
 * 1) Hospital Bill (screenshot #2): Should extract lab/pharmacy/room codes, NO 99213
 * 2) Small EOB (screenshot #1): Should extract 99213 x4 totaling $70.52
 * 3) Case isolation: Results never cross-pollinate between uploads
 */

import { TableAwareExtractor } from '@/lib/table-aware-extraction';
import { CaseBindingManager } from '@/lib/case-binding';
import { UICaseGuard } from '@/lib/ui-case-guard';

describe('Analyzer Case Binding & Table Extraction', () => {
  let extractor: TableAwareExtractor;
  let caseManager: CaseBindingManager;
  let uiGuard: UICaseGuard;

  beforeEach(() => {
    extractor = new TableAwareExtractor();
    caseManager = CaseBindingManager.getInstance();
    uiGuard = UICaseGuard.getInstance();

    // Clear any existing state
    caseManager.clearAllCases();
    uiGuard.clearCurrentCase();
  });

  describe('Hospital Bill Fixture A (No 99213 Bug)', () => {
    const hospitalBillOCR = {
      tokens: [
        // Header row
        { text: 'Description', bbox: [100, 50, 80, 20], conf: 0.95, page: 1 },
        { text: 'Charges', bbox: [300, 50, 60, 20], conf: 0.95, page: 1 },

        // Lab tests - these should be extracted
        { text: '85025', bbox: [100, 100, 50, 15], conf: 0.92, page: 1 },
        { text: 'CBC AUTO DIFF', bbox: [160, 100, 120, 15], conf: 0.90, page: 1 },
        { text: '$45.00', bbox: [300, 100, 50, 15], conf: 0.93, page: 1 },

        { text: '80053', bbox: [100, 120, 50, 15], conf: 0.91, page: 1 },
        { text: 'COMPREHENSIVE METABOLIC PANEL', bbox: [160, 120, 180, 15], conf: 0.88, page: 1 },
        { text: '$78.50', bbox: [300, 120, 50, 15], conf: 0.92, page: 1 },

        { text: '86885', bbox: [100, 140, 50, 15], conf: 0.90, page: 1 },
        { text: 'COOMBS TEST', bbox: [160, 140, 100, 15], conf: 0.89, page: 1 },
        { text: '$32.75', bbox: [300, 140, 50, 15], conf: 0.91, page: 1 },

        // Pharmacy J-codes - these should be extracted
        { text: 'J1200', bbox: [100, 180, 50, 15], conf: 0.93, page: 1 },
        { text: 'DIPHENHYDRAMINE INJECTION', bbox: [160, 180, 150, 15], conf: 0.87, page: 1 },
        { text: '$28.90', bbox: [300, 180, 50, 15], conf: 0.94, page: 1 },

        { text: 'J7999', bbox: [100, 200, 50, 15], conf: 0.92, page: 1 },
        { text: 'COMPOUNDED DRUG', bbox: [160, 200, 120, 15], conf: 0.86, page: 1 },
        { text: '$156.00', bbox: [300, 200, 50, 15], conf: 0.93, page: 1 },

        // Room charges - these should be extracted (revenue codes)
        { text: '02491', bbox: [100, 240, 50, 15], conf: 0.89, page: 1 },
        { text: 'SEMI-PRIV ROOM', bbox: [160, 240, 120, 15], conf: 0.85, page: 1 },
        { text: '$890.00', bbox: [300, 240, 60, 15], conf: 0.91, page: 1 },

        { text: '02492', bbox: [100, 260, 50, 15], conf: 0.88, page: 1 },
        { text: 'SEMI-PRIV ROOM', bbox: [160, 260, 120, 15], conf: 0.84, page: 1 },
        { text: '$890.00', bbox: [300, 260, 60, 15], conf: 0.90, page: 1 },

        // Potential false positive - this should NOT be extracted as 99213
        { text: '99213', bbox: [500, 300, 50, 15], conf: 0.80, page: 1 },
        { text: 'Patient ID Number', bbox: [560, 300, 140, 15], conf: 0.75, page: 1 },
        // No charge amount - should be rejected

        // Date that looks like a CPT - should be rejected
        { text: '12024', bbox: [100, 320, 50, 15], conf: 0.85, page: 1 },
        { text: 'Date of Service', bbox: [160, 320, 120, 15], conf: 0.80, page: 1 }
      ],
      kvs: [],
      tables: [{
        page: 1,
        rows: [
          [
            { text: 'Description', bbox: [100, 50, 80, 20], conf: 0.95, page: 1 },
            { text: 'Charges', bbox: [300, 50, 60, 20], conf: 0.95, page: 1 }
          ],
          [
            { text: '85025 CBC AUTO DIFF', bbox: [100, 100, 180, 15], conf: 0.91, page: 1 },
            { text: '$45.00', bbox: [300, 100, 50, 15], conf: 0.93, page: 1 }
          ],
          [
            { text: '80053 COMPREHENSIVE METABOLIC PANEL', bbox: [100, 120, 240, 15], conf: 0.89, page: 1 },
            { text: '$78.50', bbox: [300, 120, 50, 15], conf: 0.92, page: 1 }
          ]
        ]
      }],
      metadata: { engine: 'textract', pages: 1, docTypeHint: 'bill' }
    };

    test('should extract expected lab codes and amounts', () => {
      const caseId = 'test-case-hospital-bill';
      const artifactId = 'artifact-hospital-bill';

      const lineItems = extractor.extractLineItems(artifactId, caseId, hospitalBillOCR, 'BILL');

      // Should find lab codes
      const labCodes = lineItems.filter(item =>
        ['85025', '80053', '86885'].includes(item.code || '')
      );
      expect(labCodes).toHaveLength(3);

      // Should find J-codes
      const jCodes = lineItems.filter(item =>
        item.code?.startsWith('J') && ['J1200', 'J7999'].includes(item.code)
      );
      expect(jCodes).toHaveLength(2);

      // Should find room charges (as revenue codes or descriptions)
      const roomCharges = lineItems.filter(item =>
        item.description?.includes('SEMI-PRIV') ||
        ['02491', '02492'].includes(item.code || '')
      );
      expect(roomCharges.length).toBeGreaterThan(0);
    });

    test('should NOT extract 99213 when it appears as patient ID', () => {
      const caseId = 'test-case-hospital-bill';
      const artifactId = 'artifact-hospital-bill';

      const lineItems = extractor.extractLineItems(artifactId, caseId, hospitalBillOCR, 'BILL');

      // Should NOT find 99213 because it has no associated charge
      const cpt99213 = lineItems.filter(item => item.code === '99213');
      expect(cpt99213).toHaveLength(0);
    });

    test('should NOT extract date as CPT code', () => {
      const caseId = 'test-case-hospital-bill';
      const artifactId = 'artifact-hospital-bill';

      const lineItems = extractor.extractLineItems(artifactId, caseId, hospitalBillOCR, 'BILL');

      // Should NOT find 12024 because it looks like a date
      const dateAsCPT = lineItems.filter(item => item.code === '12024');
      expect(dateAsCPT).toHaveLength(0);
    });

    test('should validate charges within tolerance', () => {
      const caseId = 'test-case-hospital-bill';
      const artifactId = 'artifact-hospital-bill';

      const lineItems = extractor.extractLineItems(artifactId, caseId, hospitalBillOCR, 'BILL');

      // Check specific expected amounts (tolerance ±$0.10)
      const cbc = lineItems.find(item => item.code === '85025');
      expect(cbc?.charge).toBeCloseTo(4500, 0); // $45.00 in cents

      const cmp = lineItems.find(item => item.code === '80053');
      expect(cmp?.charge).toBeCloseTo(7850, 0); // $78.50 in cents
    });
  });

  describe('Small EOB Fixture B (99213 Expected)', () => {
    const eobOCR = {
      tokens: [
        // Header
        { text: 'Service', bbox: [50, 30, 60, 20], conf: 0.95, page: 1 },
        { text: 'Billed', bbox: [200, 30, 50, 20], conf: 0.95, page: 1 },
        { text: 'Allowed', bbox: [270, 30, 60, 20], conf: 0.95, page: 1 },

        // 99213 entries totaling $70.52
        { text: '99213', bbox: [50, 60, 50, 15], conf: 0.92, page: 1 },
        { text: 'OFFICE VISIT', bbox: [110, 60, 80, 15], conf: 0.90, page: 1 },
        { text: '$17.63', bbox: [200, 60, 50, 15], conf: 0.93, page: 1 },
        { text: '$0.00', bbox: [270, 60, 50, 15], conf: 0.93, page: 1 },

        { text: '99213', bbox: [50, 80, 50, 15], conf: 0.91, page: 1 },
        { text: 'OFFICE VISIT', bbox: [110, 80, 80, 15], conf: 0.89, page: 1 },
        { text: '$17.63', bbox: [200, 80, 50, 15], conf: 0.92, page: 1 },
        { text: '$0.00', bbox: [270, 80, 50, 15], conf: 0.92, page: 1 },

        { text: '99213', bbox: [50, 100, 50, 15], conf: 0.90, page: 1 },
        { text: 'OFFICE VISIT', bbox: [110, 100, 80, 15], conf: 0.88, page: 1 },
        { text: '$17.63', bbox: [200, 100, 50, 15], conf: 0.91, page: 1 },
        { text: '$0.00', bbox: [270, 100, 50, 15], conf: 0.91, page: 1 },

        { text: '99213', bbox: [50, 120, 50, 15], conf: 0.89, page: 1 },
        { text: 'OFFICE VISIT', bbox: [110, 120, 80, 15], conf: 0.87, page: 1 },
        { text: '$17.63', bbox: [200, 120, 50, 15], conf: 0.90, page: 1 },
        { text: '$0.00', bbox: [270, 120, 50, 15], conf: 0.90, page: 1 }
      ],
      kvs: [],
      tables: [{
        page: 1,
        rows: [
          [
            { text: 'Service', bbox: [50, 30, 60, 20], conf: 0.95, page: 1 },
            { text: 'Billed', bbox: [200, 30, 50, 20], conf: 0.95, page: 1 }
          ],
          [
            { text: '99213 OFFICE VISIT', bbox: [50, 60, 140, 15], conf: 0.91, page: 1 },
            { text: '$17.63', bbox: [200, 60, 50, 15], conf: 0.93, page: 1 }
          ]
        ]
      }],
      metadata: { engine: 'textract', pages: 1, docTypeHint: 'eob' }
    };

    test('should extract 99213 x4 totaling $70.52', () => {
      const caseId = 'test-case-eob';
      const artifactId = 'artifact-eob';

      const lineItems = extractor.extractLineItems(artifactId, caseId, eobOCR, 'EOB');

      // Should find 4 instances of 99213
      const officeVisits = lineItems.filter(item => item.code === '99213');
      expect(officeVisits).toHaveLength(4);

      // Should total $70.52 (7052 cents)
      const totalBilled = officeVisits.reduce((sum, item) => sum + (item.charge || 0), 0);
      expect(totalBilled).toBeCloseTo(7052, 0); // $70.52 in cents
    });

    test('should handle $0 allowed/paid amounts correctly', () => {
      const caseId = 'test-case-eob';
      const artifactId = 'artifact-eob';

      const lineItems = extractor.extractLineItems(artifactId, caseId, eobOCR, 'EOB');

      const officeVisits = lineItems.filter(item => item.code === '99213');

      // All should have $0 allowed (this is valid for EOB)
      officeVisits.forEach(item => {
        expect(item.allowed).toBe(0);
      });
    });
  });

  describe('Case Isolation Tests', () => {
    test('should prevent cross-pollination between cases', async () => {
      // Simulate rapid uploads of different cases
      const caseA = caseManager.createCaseBinding(new File([], 'hospital-bill.pdf'));
      const caseB = caseManager.createCaseBinding(new File([], 'eob.pdf'));

      // Start case A in UI
      uiGuard.startNewCase(caseA.caseId);

      // Simulate case A results
      const resultsA = {
        caseId: caseA.caseId,
        artifactDigest: 'digest-a',
        lineItems: [{ code: '85025', description: 'CBC' }]
      };

      // Case B results arrive (should be blocked)
      const resultsB = {
        caseId: caseB.caseId,
        artifactDigest: 'digest-b',
        lineItems: [{ code: '99213', description: 'Office Visit' }]
      };

      // Should block case B results when case A is active
      expect(uiGuard.shouldBlockRender(resultsB)).toBe(true);
      expect(uiGuard.shouldBlockRender(resultsA)).toBe(false);
    });

    test('should validate artifact digest correlation', () => {
      const file = new File([], 'test.pdf');
      const { caseId, artifactBinding } = caseManager.createCaseBinding(file);

      // Set correct digest
      caseManager.setArtifactDigest(caseId, artifactBinding.artifactId, Buffer.from('test'));

      // Valid response should pass
      const validResponse = {
        caseId,
        artifactId: artifactBinding.artifactId,
        artifactDigest: artifactBinding.artifactDigest
      };

      expect(caseManager.validateWorkerResponse(validResponse as any)).toBe(true);

      // Invalid digest should fail
      const invalidResponse = {
        caseId,
        artifactId: artifactBinding.artifactId,
        artifactDigest: 'wrong-digest'
      };

      expect(caseManager.validateWorkerResponse(invalidResponse as any)).toBe(false);
    });

    test('should generate unique line IDs with case correlation', () => {
      const caseId1 = 'case-1';
      const caseId2 = 'case-2';
      const artifactId = 'same-artifact';

      // Same line item data but different cases should generate different IDs
      const lineId1 = caseManager.generateLineItemId(caseId1, artifactId, '99213', 'Office Visit', '01/01/2024', 1763, 0);
      const lineId2 = caseManager.generateLineItemId(caseId2, artifactId, '99213', 'Office Visit', '01/01/2024', 1763, 0);

      expect(lineId1).not.toBe(lineId2);
      expect(lineId1).toContain(caseId1);
      expect(lineId2).toContain(caseId2);
    });
  });

  describe('CPT Code Validation', () => {
    test('should reject 5-digit numbers that are dates', () => {
      const testCases = [
        { code: '12024', context: 'Date of Service: 12024', expected: false },
        { code: '01024', context: 'Date: 01024', expected: false },
        { code: '99213', context: 'Office Visit procedure', expected: true }
      ];

      testCases.forEach(({ code, context, expected }) => {
        const isValid = extractor['validateCPTCode'](code, context, 1000);
        if (expected) {
          expect(isValid).toBe(code);
        } else {
          expect(isValid).toBeUndefined();
        }
      });
    });

    test('should require clinical context for CPT codes', () => {
      const testCases = [
        { code: '99213', context: 'Patient ID: 99213', expected: false },
        { code: '99213', context: 'Account Number: 99213', expected: false },
        { code: '99213', context: 'Office Visit Level 3', expected: true },
        { code: '85025', context: 'CBC with differential', expected: true }
      ];

      testCases.forEach(({ code, context, expected }) => {
        const isValid = extractor['validateCPTCode'](code, context, 1000);
        if (expected) {
          expect(isValid).toBe(code);
        } else {
          expect(isValid).toBeUndefined();
        }
      });
    });

    test('should require monetary amount for valid CPT', () => {
      const validCode = extractor['validateCPTCode']('99213', 'Office Visit', 1763);
      const invalidCode = extractor['validateCPTCode']('99213', 'Office Visit', 0);

      expect(validCode).toBe('99213');
      expect(invalidCode).toBeUndefined();
    });
  });

  describe('HCPCS Code Validation', () => {
    test('should accept valid HCPCS codes', () => {
      const hcpcsCodes = ['J1200', 'A9150', 'J7999', 'J8499', 'J7120'];

      hcpcsCodes.forEach(code => {
        const isValid = extractor['validateAndExtractCode'](code, 'Drug injection', 1000);
        expect(isValid).toBe(code);
      });
    });
  });
});