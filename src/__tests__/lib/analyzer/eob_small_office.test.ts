import { TableAwareExtractor } from '@/lib/table-aware-extraction';
import { LineItem } from '@/types/analyzer';

describe('EOB Small Office Test - Legitimate 99213 Usage', () => {
  let extractor: TableAwareExtractor;

  beforeEach(() => {
    extractor = new TableAwareExtractor();
    // Ensure STRICT_EXTRACT mode is enabled
    process.env.STRICT_EXTRACT = 'true';
  });

  describe('Small Office EOB with legitimate 99213', () => {
    // Mock EOB data that legitimately contains 99213 in proper table context
    const mockSmallOfficeEOB = {
      tokens: [
        // EOB Header
        { text: 'EXPLANATION', bbox: [100, 50, 80, 20], conf: 0.95 },
        { text: 'OF', bbox: [190, 50, 20, 20], conf: 0.95 },
        { text: 'BENEFITS', bbox: [220, 50, 60, 20], conf: 0.95 },

        // Provider info
        { text: 'Dr.', bbox: [50, 80, 25, 15], conf: 0.9 },
        { text: 'Smith', bbox: [80, 80, 40, 15], conf: 0.9 },
        { text: 'Family', bbox: [130, 80, 40, 15], conf: 0.9 },
        { text: 'Practice', bbox: [180, 80, 50, 15], conf: 0.9 },

        // Table header
        { text: 'SERVICE', bbox: [50, 120, 60, 15], conf: 0.9 },
        { text: 'CODE', bbox: [120, 120, 40, 15], conf: 0.9 },
        { text: 'DESCRIPTION', bbox: [170, 120, 80, 15], conf: 0.9 },
        { text: 'BILLED', bbox: [260, 120, 50, 15], conf: 0.9 },
        { text: 'ALLOWED', bbox: [320, 120, 60, 15], conf: 0.9 },
        { text: 'PLAN', bbox: [390, 120, 35, 15], conf: 0.9 },
        { text: 'PAID', bbox: [430, 120, 35, 15], conf: 0.9 },
        { text: 'YOUR', bbox: [470, 120, 35, 15], conf: 0.9 },
        { text: 'COST', bbox: [510, 120, 35, 15], conf: 0.9 },

        // Legitimate 99213 line item with full table context
        { text: '03/15/2024', bbox: [50, 150, 70, 15], conf: 0.95 },
        { text: '99213', bbox: [120, 150, 40, 15], conf: 0.95 },
        { text: 'OFFICE', bbox: [170, 150, 45, 15], conf: 0.90 },
        { text: 'VISIT', bbox: [220, 150, 35, 15], conf: 0.90 },
        { text: 'EST', bbox: [260, 150, 25, 15], conf: 0.88 },
        { text: 'PATIENT', bbox: [290, 150, 50, 15], conf: 0.88 },
        { text: '$85.00', bbox: [350, 150, 45, 15], conf: 0.95 },
        { text: '$70.52', bbox: [410, 150, 45, 15], conf: 0.95 },
        { text: '$56.42', bbox: [470, 150, 45, 15], conf: 0.95 },
        { text: '$14.10', bbox: [520, 150, 45, 15], conf: 0.95 },

        // Totals
        { text: 'TOTALS:', bbox: [50, 180, 50, 15], conf: 0.9 },
        { text: '$85.00', bbox: [350, 180, 45, 15], conf: 0.95 },
        { text: '$70.52', bbox: [410, 180, 45, 15], conf: 0.95 },
        { text: '$56.42', bbox: [470, 180, 45, 15], conf: 0.95 },
        { text: '$14.10', bbox: [520, 180, 45, 15], conf: 0.95 },
      ],
      tables: [{
        page: 1,
        rows: [
          // Header row
          [
            { text: 'SERVICE', bbox: [50, 120, 60, 15], conf: 0.9 },
            { text: 'CODE', bbox: [120, 120, 40, 15], conf: 0.9 },
            { text: 'DESCRIPTION', bbox: [170, 120, 80, 15], conf: 0.9 },
            { text: 'BILLED', bbox: [260, 120, 50, 15], conf: 0.9 },
            { text: 'ALLOWED', bbox: [320, 120, 60, 15], conf: 0.9 },
            { text: 'PLAN PAID', bbox: [390, 120, 70, 15], conf: 0.9 },
            { text: 'YOUR COST', bbox: [470, 120, 70, 15], conf: 0.9 }
          ],
          // Legitimate 99213 row with complete table context
          [
            { text: '03/15/2024', bbox: [50, 150, 70, 15], conf: 0.95 },
            { text: '99213', bbox: [120, 150, 40, 15], conf: 0.95 },
            { text: 'OFFICE VISIT EST PATIENT', bbox: [170, 150, 170, 15], conf: 0.90 },
            { text: '$85.00', bbox: [350, 150, 45, 15], conf: 0.95 },
            { text: '$70.52', bbox: [410, 150, 45, 15], conf: 0.95 },
            { text: '$56.42', bbox: [470, 150, 45, 15], conf: 0.95 },
            { text: '$14.10', bbox: [520, 150, 45, 15], conf: 0.95 }
          ]
        ]
      }]
    };

    it('should extract legitimate 99213 when in proper EOB table context', () => {
      const lineItems = extractor.extractLineItems(
        'eob-artifact-789',
        'eob-case-012',
        mockSmallOfficeEOB,
        'EOB'
      );

      // Should extract exactly one 99213 line item
      const cpt99213Items = lineItems.filter(item => item.code === '99213');
      expect(cpt99213Items).toHaveLength(1);

      const officeVisit = cpt99213Items[0];
      expect(officeVisit.description).toContain('OFFICE VISIT');
      expect(officeVisit.charge).toBe(8500); // $85.00 in cents
      expect(officeVisit.allowed).toBe(7052); // $70.52 in cents
      expect(officeVisit.planPaid).toBe(5642); // $56.42 in cents
      expect(officeVisit.patientResp).toBe(1410); // $14.10 in cents
    });

    it('should calculate correct EOB totals', () => {
      const lineItems = extractor.extractLineItems(
        'eob-artifact-789',
        'eob-case-012',
        mockSmallOfficeEOB,
        'EOB'
      );

      const totalBilled = lineItems.reduce((sum, item) => sum + (item.charge || 0), 0);
      const totalAllowed = lineItems.reduce((sum, item) => sum + (item.allowed || 0), 0);
      const totalPlanPaid = lineItems.reduce((sum, item) => sum + (item.planPaid || 0), 0);
      const totalPatientResp = lineItems.reduce((sum, item) => sum + (item.patientResp || 0), 0);

      expect(totalBilled).toBe(8500); // $85.00
      expect(totalAllowed).toBe(7052); // $70.52
      expect(totalPlanPaid).toBe(5642); // $56.42
      expect(totalPatientResp).toBe(1410); // $14.10

      // EOB math should be internally consistent
      expect(totalAllowed).toBe(totalPlanPaid + totalPatientResp);
    });

    it('should have different artifactId than hospital bill case', () => {
      const lineItems = extractor.extractLineItems(
        'eob-artifact-789', // Different from hospital bill
        'eob-case-012',     // Different case ID
        mockSmallOfficeEOB,
        'EOB'
      );

      expect(lineItems.length).toBeGreaterThan(0);
      lineItems.forEach(item => {
        expect(item.artifactId).toBe('eob-artifact-789');
        expect(item.lineId).toContain('eob-case-012');
      });
    });

    it('should maintain EOB structure with proper amounts', () => {
      const lineItems = extractor.extractLineItems(
        'eob-artifact-789',
        'eob-case-012',
        mockSmallOfficeEOB,
        'EOB'
      );

      // Should extract one legitimate line item
      expect(lineItems).toHaveLength(1);

      const lineItem = lineItems[0];
      expect(lineItem.code).toBe('99213');
      expect(lineItem.dos).toBeDefined();
      expect(lineItem.charge).toBeGreaterThan(0);
      expect(lineItem.allowed).toBeGreaterThan(0);
      expect(lineItem.planPaid).toBeGreaterThan(0);
      expect(lineItem.patientResp).toBeGreaterThan(0);
    });
  });

  describe('Case isolation verification', () => {
    it('should not cross-contaminate with hospital bill case data', () => {
      const eobLineItems = extractor.extractLineItems(
        'eob-artifact-789',
        'eob-case-012',
        mockSmallOfficeEOB,
        'EOB'
      );

      // EOB should only contain office visit codes, not hospital lab codes
      const extractedCodes = eobLineItems.map(item => item.code).filter(Boolean);

      expect(extractedCodes).toContain('99213');
      expect(extractedCodes).not.toContain('85025'); // Hospital lab code
      expect(extractedCodes).not.toContain('80053'); // Hospital lab code
      expect(extractedCodes).not.toContain('A9150'); // Hospital pharmacy code
      expect(extractedCodes).not.toContain('J1200'); // Hospital pharmacy code

      // Should only have exactly one code
      expect(extractedCodes).toHaveLength(1);
    });
  });

  const mockSmallOfficeEOB = {
    tokens: [
      // EOB Header
      { text: 'EXPLANATION', bbox: [100, 50, 80, 20], conf: 0.95 },
      { text: 'OF', bbox: [190, 50, 20, 20], conf: 0.95 },
      { text: 'BENEFITS', bbox: [220, 50, 60, 20], conf: 0.95 },

      // Provider info
      { text: 'Dr.', bbox: [50, 80, 25, 15], conf: 0.9 },
      { text: 'Smith', bbox: [80, 80, 40, 15], conf: 0.9 },
      { text: 'Family', bbox: [130, 80, 40, 15], conf: 0.9 },
      { text: 'Practice', bbox: [180, 80, 50, 15], conf: 0.9 },

      // Table header
      { text: 'SERVICE', bbox: [50, 120, 60, 15], conf: 0.9 },
      { text: 'CODE', bbox: [120, 120, 40, 15], conf: 0.9 },
      { text: 'DESCRIPTION', bbox: [170, 120, 80, 15], conf: 0.9 },
      { text: 'BILLED', bbox: [260, 120, 50, 15], conf: 0.9 },
      { text: 'ALLOWED', bbox: [320, 120, 60, 15], conf: 0.9 },
      { text: 'PLAN', bbox: [390, 120, 35, 15], conf: 0.9 },
      { text: 'PAID', bbox: [430, 120, 35, 15], conf: 0.9 },
      { text: 'YOUR', bbox: [470, 120, 35, 15], conf: 0.9 },
      { text: 'COST', bbox: [510, 120, 35, 15], conf: 0.9 },

      // Legitimate 99213 line item with full table context
      { text: '03/15/2024', bbox: [50, 150, 70, 15], conf: 0.95 },
      { text: '99213', bbox: [120, 150, 40, 15], conf: 0.95 },
      { text: 'OFFICE', bbox: [170, 150, 45, 15], conf: 0.90 },
      { text: 'VISIT', bbox: [220, 150, 35, 15], conf: 0.90 },
      { text: 'EST', bbox: [260, 150, 25, 15], conf: 0.88 },
      { text: 'PATIENT', bbox: [290, 150, 50, 15], conf: 0.88 },
      { text: '$85.00', bbox: [350, 150, 45, 15], conf: 0.95 },
      { text: '$70.52', bbox: [410, 150, 45, 15], conf: 0.95 },
      { text: '$56.42', bbox: [470, 150, 45, 15], conf: 0.95 },
      { text: '$14.10', bbox: [520, 150, 45, 15], conf: 0.95 },

      // Totals
      { text: 'TOTALS:', bbox: [50, 180, 50, 15], conf: 0.9 },
      { text: '$85.00', bbox: [350, 180, 45, 15], conf: 0.95 },
      { text: '$70.52', bbox: [410, 180, 45, 15], conf: 0.95 },
      { text: '$56.42', bbox: [470, 180, 45, 15], conf: 0.95 },
      { text: '$14.10', bbox: [520, 180, 45, 15], conf: 0.95 },
    ],
    tables: [{
      page: 1,
      rows: [
        // Header row
        [
          { text: 'SERVICE', bbox: [50, 120, 60, 15], conf: 0.9 },
          { text: 'CODE', bbox: [120, 120, 40, 15], conf: 0.9 },
          { text: 'DESCRIPTION', bbox: [170, 120, 80, 15], conf: 0.9 },
          { text: 'BILLED', bbox: [260, 120, 50, 15], conf: 0.9 },
          { text: 'ALLOWED', bbox: [320, 120, 60, 15], conf: 0.9 },
          { text: 'PLAN PAID', bbox: [390, 120, 70, 15], conf: 0.9 },
          { text: 'YOUR COST', bbox: [470, 120, 70, 15], conf: 0.9 }
        ],
        // Legitimate 99213 row with complete table context
        [
          { text: '03/15/2024', bbox: [50, 150, 70, 15], conf: 0.95 },
          { text: '99213', bbox: [120, 150, 40, 15], conf: 0.95 },
          { text: 'OFFICE VISIT EST PATIENT', bbox: [170, 150, 170, 15], conf: 0.90 },
          { text: '$85.00', bbox: [350, 150, 45, 15], conf: 0.95 },
          { text: '$70.52', bbox: [410, 150, 45, 15], conf: 0.95 },
          { text: '$56.42', bbox: [470, 150, 45, 15], conf: 0.95 },
          { text: '$14.10', bbox: [520, 150, 45, 15], conf: 0.95 }
        ]
      ]
    }]
  };
});