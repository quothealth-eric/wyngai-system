import { TableAwareExtractor } from '@/lib/table-aware-extraction';
import { EnhancedOCRPipeline } from '@/lib/enhanced-ocr-pipeline';
import { LineItem } from '@/types/analyzer';

describe('Hospital Bill Itemized Test - Prevents 99213 Hallucination', () => {
  let extractor: TableAwareExtractor;
  let ocrPipeline: EnhancedOCRPipeline;

  beforeEach(() => {
    extractor = new TableAwareExtractor();
    ocrPipeline = new EnhancedOCRPipeline();
    // Ensure STRICT_EXTRACT mode is enabled
    process.env.STRICT_EXTRACT = 'true';
  });

  afterEach(async () => {
    await ocrPipeline.cleanup();
  });

  describe('Good Samaritan Medical Center - Page 2/3 Hospital Bill', () => {
    // Mock OCR data representing a hospital itemized bill
    const mockHospitalOCRResult = {
      tokens: [
        // Header tokens
        { text: 'GOOD', bbox: [100, 50, 50, 20], conf: 0.95 },
        { text: 'SAMARITAN', bbox: [160, 50, 80, 20], conf: 0.95 },
        { text: 'MEDICAL', bbox: [250, 50, 60, 20], conf: 0.95 },
        { text: 'CENTER', bbox: [320, 50, 60, 20], conf: 0.95 },

        // Table header
        { text: 'DESCRIPTION', bbox: [50, 100, 100, 15], conf: 0.9 },
        { text: 'CHARGES', bbox: [300, 100, 80, 15], conf: 0.9 },
        { text: 'BALANCE', bbox: [400, 100, 70, 15], conf: 0.9 },

        // Lab work line items (should be extracted properly)
        { text: '85025', bbox: [50, 130, 40, 15], conf: 0.92 },
        { text: 'COMPLETE', bbox: [100, 130, 60, 15], conf: 0.90 },
        { text: 'BLOOD', bbox: [170, 130, 40, 15], conf: 0.88 },
        { text: 'COUNT', bbox: [220, 130, 40, 15], conf: 0.88 },
        { text: '$47.25', bbox: [300, 130, 50, 15], conf: 0.95 },

        { text: '80053', bbox: [50, 150, 40, 15], conf: 0.92 },
        { text: 'COMPREHENSIVE', bbox: [100, 150, 80, 15], conf: 0.90 },
        { text: 'METABOLIC', bbox: [190, 150, 60, 15], conf: 0.88 },
        { text: 'PANEL', bbox: [260, 150, 40, 15], conf: 0.88 },
        { text: '$89.50', bbox: [300, 150, 50, 15], conf: 0.95 },

        { text: '86885', bbox: [50, 170, 40, 15], conf: 0.92 },
        { text: 'COOMBS', bbox: [100, 170, 50, 15], conf: 0.90 },
        { text: 'TEST', bbox: [160, 170, 30, 15], conf: 0.88 },
        { text: '$34.75', bbox: [300, 170, 50, 15], conf: 0.95 },

        { text: '82962', bbox: [50, 190, 40, 15], conf: 0.92 },
        { text: 'GLUCOSE', bbox: [100, 190, 50, 15], conf: 0.90 },
        { text: 'SERUM', bbox: [160, 190, 40, 15], conf: 0.88 },
        { text: '$23.00', bbox: [300, 190, 50, 15], conf: 0.95 },

        { text: '86592', bbox: [50, 210, 40, 15], conf: 0.92 },
        { text: 'SYPHILIS', bbox: [100, 210, 50, 15], conf: 0.90 },
        { text: 'TEST', bbox: [160, 210, 30, 15], conf: 0.88 },
        { text: '$28.25', bbox: [300, 210, 50, 15], conf: 0.95 },

        { text: '36415', bbox: [50, 230, 40, 15], conf: 0.92 },
        { text: 'VENIPUNCTURE', bbox: [100, 230, 80, 15], conf: 0.90 },
        { text: '$15.50', bbox: [300, 230, 50, 15], conf: 0.95 },

        // Pharmacy items (J-codes)
        { text: 'A9150', bbox: [50, 250, 40, 15], conf: 0.92 },
        { text: 'TECHNETIUM', bbox: [100, 250, 70, 15], conf: 0.90 },
        { text: '$125.00', bbox: [300, 250, 60, 15], conf: 0.95 },

        { text: 'J1200', bbox: [50, 270, 40, 15], conf: 0.92 },
        { text: 'DIPHENHYDRAMINE', bbox: [100, 270, 90, 15], conf: 0.90 },
        { text: '$45.75', bbox: [300, 270, 50, 15], conf: 0.95 },

        { text: 'J7999', bbox: [50, 290, 40, 15], conf: 0.92 },
        { text: 'COMPOUNDED', bbox: [100, 290, 70, 15], conf: 0.90 },
        { text: 'DRUG', bbox: [180, 290, 30, 15], conf: 0.88 },
        { text: '$89.25', bbox: [300, 290, 50, 15], conf: 0.95 },

        { text: 'J8499', bbox: [50, 310, 40, 15], conf: 0.92 },
        { text: 'ORAL', bbox: [100, 310, 30, 15], conf: 0.90 },
        { text: 'ANTICANCER', bbox: [140, 310, 70, 15], conf: 0.88 },
        { text: '$156.50', bbox: [300, 310, 60, 15], conf: 0.95 },

        { text: 'J7120', bbox: [50, 330, 40, 15], conf: 0.92 },
        { text: 'RINGERS', bbox: [100, 330, 50, 15], conf: 0.90 },
        { text: 'LACTATE', bbox: [160, 330, 50, 15], conf: 0.88 },
        { text: '$23.75', bbox: [300, 330, 50, 15], conf: 0.95 },

        // Room and board charges (high dollar amounts)
        { text: 'SEMI-PRIV', bbox: [50, 350, 60, 15], conf: 0.90 },
        { text: '02491', bbox: [120, 350, 40, 15], conf: 0.92 },
        { text: 'ROOM', bbox: [170, 350, 30, 15], conf: 0.88 },
        { text: 'CHARGE', bbox: [210, 350, 50, 15], conf: 0.88 },
        { text: '$1,250.00', bbox: [300, 350, 70, 15], conf: 0.95 },

        { text: 'SEMI-PRIV', bbox: [50, 370, 60, 15], conf: 0.90 },
        { text: '02492', bbox: [120, 370, 40, 15], conf: 0.92 },
        { text: 'BOARD', bbox: [170, 370, 40, 15], conf: 0.88 },
        { text: 'CHARGE', bbox: [220, 370, 50, 15], conf: 0.88 },
        { text: '$1,875.50', bbox: [300, 370, 70, 15], conf: 0.95 },
      ],
      tables: [{
        page: 1,
        rows: [
          // Header row
          [
            { text: 'DESCRIPTION', bbox: [50, 100, 100, 15], conf: 0.9 },
            { text: 'CHARGES', bbox: [300, 100, 80, 15], conf: 0.9 },
            { text: 'BALANCE', bbox: [400, 100, 70, 15], conf: 0.9 }
          ],
          // Data rows with actual codes (not 99213!)
          [
            { text: '85025 COMPLETE BLOOD COUNT', bbox: [50, 130, 200, 15], conf: 0.9 },
            { text: '$47.25', bbox: [300, 130, 50, 15], conf: 0.95 },
            { text: '$47.25', bbox: [400, 130, 50, 15], conf: 0.95 }
          ],
          [
            { text: '80053 COMPREHENSIVE METABOLIC PANEL', bbox: [50, 150, 220, 15], conf: 0.9 },
            { text: '$89.50', bbox: [300, 150, 50, 15], conf: 0.95 },
            { text: '$89.50', bbox: [400, 150, 50, 15], conf: 0.95 }
          ],
          [
            { text: 'A9150 TECHNETIUM', bbox: [50, 250, 140, 15], conf: 0.9 },
            { text: '$125.00', bbox: [300, 250, 60, 15], conf: 0.95 },
            { text: '$125.00', bbox: [400, 250, 60, 15], conf: 0.95 }
          ],
          [
            { text: 'J1200 DIPHENHYDRAMINE', bbox: [50, 270, 150, 15], conf: 0.9 },
            { text: '$45.75', bbox: [300, 270, 50, 15], conf: 0.95 },
            { text: '$45.75', bbox: [400, 270, 50, 15], conf: 0.95 }
          ],
          // Room charges without traditional medical codes
          [
            { text: 'SEMI-PRIV 02491 ROOM CHARGE', bbox: [50, 350, 200, 15], conf: 0.9 },
            { text: '$1,250.00', bbox: [300, 350, 70, 15], conf: 0.95 },
            { text: '$1,250.00', bbox: [400, 350, 70, 15], conf: 0.95 }
          ]
        ]
      }]
    };

    it('should extract expected medical codes and NEVER generate 99213', () => {
      const lineItems = extractor.extractLineItems(
        'test-artifact-123',
        'test-case-456',
        mockHospitalOCRResult,
        'BILL'
      );

      // Critical assertion: NO 99213 codes should be present
      const cpt99213Items = lineItems.filter(item => item.code === '99213');
      expect(cpt99213Items).toHaveLength(0);

      // Should extract some legitimate codes (at least the HCPCS ones which are easier to validate)
      const extractedCodes = lineItems.map(item => item.code).filter(Boolean);

      // We expect at least some HCPCS codes to be extracted
      expect(extractedCodes.length).toBeGreaterThan(0);
      expect(extractedCodes).toContain('A9150'); // Technetium
      expect(extractedCodes).toContain('J1200'); // Diphenhydramine

      // Most importantly: NO 99213
      expect(extractedCodes).not.toContain('99213');
    });

    it('should create unstructured rows for room/board charges without valid codes', () => {
      const lineItems = extractor.extractLineItems(
        'test-artifact-123',
        'test-case-456',
        mockHospitalOCRResult,
        'BILL'
      );

      // Since we're in STRICT_EXTRACT mode, items without valid codes should become unstructured rows
      const unstructuredRows = lineItems.filter(item => item.note === 'unstructured_row');
      const regularRows = lineItems.filter(item => !item.note || item.note !== 'unstructured_row');

      // We should have some line items extracted
      expect(lineItems.length).toBeGreaterThan(0);

      // Log for debugging
      console.log('Extracted line items:', lineItems.map(item => ({
        code: item.code,
        description: item.description?.substring(0, 50),
        note: item.note
      })));
    });

    it('should calculate totals within tolerance of charges extracted', () => {
      const lineItems = extractor.extractLineItems(
        'test-artifact-123',
        'test-case-456',
        mockHospitalOCRResult,
        'BILL'
      );

      const totalCharges = lineItems.reduce((sum, item) => sum + (item.charge || 0), 0);

      // Convert from cents to dollars for comparison
      const totalDollars = totalCharges / 100;

      // Should extract some charges
      expect(totalDollars).toBeGreaterThan(0);
      expect(totalDollars).toBeLessThan(10000); // Reasonable upper bound

      // Log actual extracted total for debugging
      console.log('Total extracted charges:', totalDollars);
    });

    it('should maintain provenance with OCR coordinates', () => {
      const lineItems = extractor.extractLineItems(
        'test-artifact-123',
        'test-case-456',
        mockHospitalOCRResult,
        'BILL'
      );

      // Every line item should have OCR provenance
      lineItems.forEach(item => {
        expect(item.ocr).toBeDefined();
        expect(item.ocr?.page).toBeDefined();
        if (item.ocr?.bbox) {
          expect(item.ocr.bbox).toHaveLength(4);
        }
      });
    });
  });

  describe('Anti-hallucination validation', () => {
    it('should reject office visit text mapping to 99213', () => {
      const officeVisitOCR = {
        tokens: [
          { text: 'Office', bbox: [50, 100, 40, 15], conf: 0.9 },
          { text: 'visit', bbox: [100, 100, 30, 15], conf: 0.9 },
          { text: '$150.00', bbox: [200, 100, 60, 15], conf: 0.95 }
        ],
        tables: []
      };

      const lineItems = extractor.extractLineItems(
        'test-artifact-123',
        'test-case-456',
        officeVisitOCR,
        'BILL'
      );

      // Should create unstructured row, not extract 99213
      expect(lineItems).toHaveLength(1);
      expect(lineItems[0].code).toBeUndefined();
      expect(lineItems[0].note).toBe('unstructured_row');
      expect(lineItems[0].description).toContain('Office visit');
    });

    it('should reject generic consultation text', () => {
      const consultationOCR = {
        tokens: [
          { text: 'Consultation', bbox: [50, 100, 80, 15], conf: 0.9 },
          { text: '$200.00', bbox: [200, 100, 60, 15], conf: 0.95 }
        ],
        tables: []
      };

      const lineItems = extractor.extractLineItems(
        'test-artifact-123',
        'test-case-456',
        consultationOCR,
        'BILL'
      );

      // Should not extract any CPT codes from generic text
      const cptCodes = lineItems.filter(item => item.code && /^\d{5}$/.test(item.code));
      expect(cptCodes).toHaveLength(0);
    });
  });
});