import { TableOutputFormatter } from '@/lib/formatters/table_formatter';
import { DetectionResult } from '@/lib/detect/types';

describe('TableOutputFormatter', () => {
  let formatter: TableOutputFormatter;

  beforeEach(() => {
    formatter = new TableOutputFormatter();
  });

  describe('formatLineItems', () => {
    it('should format line items correctly', () => {
      const lineItems = [
        {
          code: '99213',
          description: 'Office visit level 3',
          amount: 15000,
          serviceDate: '2024-01-15',
          units: 1
        },
        {
          code: '85025',
          description: 'Complete blood count',
          amount: 2500,
          serviceDate: '2024-01-15',
          units: 1
        }
      ];

      const result = formatter.formatLineItems(lineItems, 0.9);

      expect(result.title).toBe('Extracted Line Items');
      expect(result.subtitle).toContain('2 procedures');
      expect(result.columns).toHaveLength(6);
      expect(result.rows).toHaveLength(2);

      // Check first row
      const firstRow = result.rows[0];
      expect(firstRow.cells.code.value).toBe('99213');
      expect(firstRow.cells.description.displayValue).toBe('Office visit level 3');
      expect(firstRow.cells.amount.value).toBe(15000);
      expect(firstRow.cells.amount.formatted).toBe('$150.00');

      // Check summary
      expect(result.summary?.totalCharges).toBe(17500);
      expect(result.summary?.itemCount).toBe(2);

      // Check metadata
      expect(result.metadata?.confidence).toBe(0.9);
      expect(result.metadata?.source).toBe('OCR extraction');
    });

    it('should handle missing descriptions gracefully', () => {
      const lineItems = [
        {
          code: '99213',
          amount: 15000,
          serviceDate: '2024-01-15',
          units: 1
        }
      ];

      const result = formatter.formatLineItems(lineItems, 0.8);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].cells.description.displayValue).toBe('N/A');
    });

    it('should highlight low-confidence items', () => {
      const lineItems = [
        {
          code: '99213',
          description: 'Office visit',
          amount: 15000,
          serviceDate: '2024-01-15',
          units: 1,
          confidence: 0.6 // Low confidence
        }
      ];

      const result = formatter.formatLineItems(lineItems, 0.9);

      expect(result.rows[0].highlighted).toBe(true);
      expect(result.rows[0].cells.confidence.highlight).toBe('warning');
    });

    it('should format dates correctly', () => {
      const lineItems = [
        {
          code: '99213',
          description: 'Office visit',
          amount: 15000,
          serviceDate: '2024-01-15',
          units: 1
        }
      ];

      const result = formatter.formatLineItems(lineItems, 0.9);

      expect(result.rows[0].cells.serviceDate.displayValue).toBe('01/15/2024');
    });

    it('should handle invalid dates gracefully', () => {
      const lineItems = [
        {
          code: '99213',
          description: 'Office visit',
          amount: 15000,
          serviceDate: 'invalid-date',
          units: 1
        }
      ];

      const result = formatter.formatLineItems(lineItems, 0.9);

      expect(result.rows[0].cells.serviceDate.displayValue).toBe('invalid-date');
    });
  });

  describe('formatDetections', () => {
    it('should format detection results correctly', () => {
      const detectionResults: DetectionResult[] = [
        {
          ruleId: 'DUPLICATES',
          triggered: true,
          confidence: 0.92,
          message: 'Found 2 duplicate charges',
          affectedItems: ['Office visit level 3'],
          recommendedAction: 'Review duplicate charges',
          potentialSavings: 15000,
          evidence: [
            {
              field: 'lineItem',
              value: '99213 - Office visit',
              location: 'Service Date: 2024-01-15'
            }
          ],
          citations: [
            {
              title: 'Medicare Claims Processing Manual',
              authority: 'CMS',
              citation: 'Chapter 1 - Duplicate claim submissions'
            }
          ]
        },
        {
          ruleId: 'UPCODING',
          triggered: false,
          confidence: 0.85,
          message: 'No upcoding detected',
          affectedItems: [],
          recommendedAction: 'No action required',
          evidence: []
        }
      ];

      const result = formatter.formatDetections(detectionResults);

      expect(result.title).toBe('Detection Results Summary');
      expect(result.totalRulesRun).toBe(2);
      expect(result.triggeredRules).toBe(1);
      expect(result.highSeverityCount).toBe(1); // DUPLICATES is high severity
      expect(result.totalPotentialSavings).toBe(15000);
      expect(result.averageConfidence).toBe(0.92); // Only triggered rules count

      expect(result.topDetections).toHaveLength(1);
      expect(result.topDetections[0].name).toBe('Duplicate Charges');
      expect(result.topDetections[0].severity).toBe('HIGH');
    });

    it('should handle no triggered detections', () => {
      const detectionResults: DetectionResult[] = [
        {
          ruleId: 'DUPLICATES',
          triggered: false,
          confidence: 0.95,
          message: 'No duplicates found',
          affectedItems: [],
          recommendedAction: 'No action required',
          evidence: []
        }
      ];

      const result = formatter.formatDetections(detectionResults);

      expect(result.triggeredRules).toBe(0);
      expect(result.highSeverityCount).toBe(0);
      expect(result.totalPotentialSavings).toBe(0);
      expect(result.averageConfidence).toBe(0);
      expect(result.topDetections).toHaveLength(0);
    });

    it('should categorize detections correctly', () => {
      const detectionResults: DetectionResult[] = [
        {
          ruleId: 'DUPLICATES',
          triggered: true,
          confidence: 0.92,
          message: 'Billing issue',
          affectedItems: [],
          recommendedAction: 'Review',
          evidence: []
        },
        {
          ruleId: 'UNBUNDLING',
          triggered: true,
          confidence: 0.88,
          message: 'Coding issue',
          affectedItems: [],
          recommendedAction: 'Review',
          evidence: []
        }
      ];

      const result = formatter.formatDetections(detectionResults);

      expect(result.detectionsByCategory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'BILLING',
            count: 1,
            highestSeverity: 'HIGH'
          }),
          expect.objectContaining({
            category: 'CODING',
            count: 1,
            highestSeverity: 'HIGH'
          })
        ])
      );
    });
  });

  describe('formatProviderInfo', () => {
    it('should format provider information correctly', () => {
      const provider = {
        npi: '1234567890',
        name: 'Dr. John Smith',
        specialty: 'Internal Medicine',
        address: '123 Main St, City, ST 12345',
        phone: '(555) 123-4567'
      };

      const result = formatter.formatProviderInfo(provider);

      expect(result.title).toBe('Provider Information');
      expect(result.rows).toHaveLength(5);

      // Check each field
      const npiRow = result.rows.find(row => row.cells.field.value === 'NPI');
      expect(npiRow?.cells.value.value).toBe('1234567890');

      const nameRow = result.rows.find(row => row.cells.field.value === 'Name');
      expect(nameRow?.cells.value.value).toBe('Dr. John Smith');
    });

    it('should highlight missing information', () => {
      const provider = {
        name: 'Dr. Smith'
        // Missing NPI, specialty, etc.
      };

      const result = formatter.formatProviderInfo(provider);

      const npiRow = result.rows.find(row => row.cells.field.value === 'NPI');
      expect(npiRow?.cells.value.value).toBe('Not provided');
      expect(npiRow?.cells.value.highlight).toBe('warning');
      expect(npiRow?.highlighted).toBe(true);
    });
  });

  describe('formatFinancialSummary', () => {
    it('should format financial totals correctly', () => {
      const totals = {
        charges: 25000,
        adjustments: 5000,
        payments: 15000,
        balance: 5000
      };

      const result = formatter.formatFinancialSummary(totals);

      expect(result.title).toBe('Financial Summary');
      expect(result.rows).toHaveLength(4);

      const chargesRow = result.rows.find(row => row.cells.category.value === 'Total Charges');
      expect(chargesRow?.cells.amount.formatted).toBe('$250.00');

      const balanceRow = result.rows.find(row => row.cells.category.value === 'Patient Balance');
      expect(balanceRow?.cells.amount.formatted).toBe('$50.00');
      expect(balanceRow?.highlighted).toBe(true); // Balance > 0 should be highlighted
    });

    it('should not highlight zero balance', () => {
      const totals = {
        charges: 25000,
        adjustments: 5000,
        payments: 20000,
        balance: 0
      };

      const result = formatter.formatFinancialSummary(totals);

      const balanceRow = result.rows.find(row => row.cells.category.value === 'Patient Balance');
      expect(balanceRow?.highlighted).toBe(false);
    });
  });

  describe('currency formatting', () => {
    it('should format currency correctly', () => {
      const lineItems = [
        {
          code: '99213',
          description: 'Office visit',
          amount: 12345, // $123.45
          serviceDate: '2024-01-15',
          units: 1
        }
      ];

      const result = formatter.formatLineItems(lineItems, 0.9);

      expect(result.rows[0].cells.amount.formatted).toBe('$123.45');
    });

    it('should handle zero amounts', () => {
      const lineItems = [
        {
          code: '99213',
          description: 'Office visit',
          amount: 0,
          serviceDate: '2024-01-15',
          units: 1
        }
      ];

      const result = formatter.formatLineItems(lineItems, 0.9);

      expect(result.rows[0].cells.amount.formatted).toBe('$0.00');
    });
  });
});