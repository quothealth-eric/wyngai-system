import { DuplicatesDetector } from '@/lib/detect/detectors/duplicates';
import { DetectionContext } from '@/lib/detect/types';

describe('DuplicatesDetector', () => {
  let detector: DuplicatesDetector;

  beforeEach(() => {
    detector = new DuplicatesDetector();
  });

  describe('detect', () => {
    it('should detect duplicate line items correctly', async () => {
      const context: DetectionContext = {
        lineItems: [
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 15000,
            serviceDate: '2024-01-15'
          },
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 15000,
            serviceDate: '2024-01-15'
          },
          {
            code: '85025',
            description: 'Complete blood count',
            amount: 2500,
            serviceDate: '2024-01-15'
          }
        ],
        totals: {
          charges: 32500,
          adjustments: 0,
          payments: 0,
          balance: 32500
        },
        dates: {
          serviceDate: '2024-01-15'
        },
        provider: {
          name: 'Test Provider'
        },
        patient: {
          id: 'TEST123'
        },
        metadata: {
          docType: 'BILL',
          confidence: 0.9
        }
      };

      const result = await detector.detect(context);

      expect(result.triggered).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.affectedItems).toContain('Office visit level 3');
      expect(result.potentialSavings).toBe(15000); // One duplicate charge
      expect(result.evidence).toHaveLength(2); // Both instances of the duplicate
    });

    it('should not trigger for unique line items', async () => {
      const context: DetectionContext = {
        lineItems: [
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 15000,
            serviceDate: '2024-01-15'
          },
          {
            code: '85025',
            description: 'Complete blood count',
            amount: 2500,
            serviceDate: '2024-01-15'
          },
          {
            code: '80053',
            description: 'Comprehensive metabolic panel',
            amount: 3500,
            serviceDate: '2024-01-15'
          }
        ],
        totals: {
          charges: 21000,
          adjustments: 0,
          payments: 0,
          balance: 21000
        },
        dates: {
          serviceDate: '2024-01-15'
        },
        provider: {
          name: 'Test Provider'
        },
        patient: {
          id: 'TEST123'
        },
        metadata: {
          docType: 'BILL',
          confidence: 0.9
        }
      };

      const result = await detector.detect(context);

      expect(result.triggered).toBe(false);
      expect(result.affectedItems).toHaveLength(0);
      expect(result.potentialSavings).toBeUndefined();
    });

    it('should detect multiple sets of duplicates', async () => {
      const context: DetectionContext = {
        lineItems: [
          // First duplicate set
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 15000,
            serviceDate: '2024-01-15'
          },
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 15000,
            serviceDate: '2024-01-15'
          },
          // Second duplicate set
          {
            code: '85025',
            description: 'Complete blood count',
            amount: 2500,
            serviceDate: '2024-01-15'
          },
          {
            code: '85025',
            description: 'Complete blood count',
            amount: 2500,
            serviceDate: '2024-01-15'
          },
          {
            code: '85025',
            description: 'Complete blood count',
            amount: 2500,
            serviceDate: '2024-01-15'
          }
        ],
        totals: {
          charges: 40000,
          adjustments: 0,
          payments: 0,
          balance: 40000
        },
        dates: {
          serviceDate: '2024-01-15'
        },
        provider: {
          name: 'Test Provider'
        },
        patient: {
          id: 'TEST123'
        },
        metadata: {
          docType: 'BILL',
          confidence: 0.9
        }
      };

      const result = await detector.detect(context);

      expect(result.triggered).toBe(true);
      expect(result.message).toContain('2 sets of duplicate charges');
      expect(result.potentialSavings).toBe(20000); // 1 duplicate of 99213 + 2 duplicates of 85025
    });

    it('should not consider same code with different amounts as duplicates', async () => {
      const context: DetectionContext = {
        lineItems: [
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 15000,
            serviceDate: '2024-01-15'
          },
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 16000, // Different amount
            serviceDate: '2024-01-15'
          }
        ],
        totals: {
          charges: 31000,
          adjustments: 0,
          payments: 0,
          balance: 31000
        },
        dates: {
          serviceDate: '2024-01-15'
        },
        provider: {
          name: 'Test Provider'
        },
        patient: {
          id: 'TEST123'
        },
        metadata: {
          docType: 'BILL',
          confidence: 0.9
        }
      };

      const result = await detector.detect(context);

      expect(result.triggered).toBe(false);
    });

    it('should not consider same code on different dates as duplicates', async () => {
      const context: DetectionContext = {
        lineItems: [
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 15000,
            serviceDate: '2024-01-15'
          },
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 15000,
            serviceDate: '2024-01-16' // Different date
          }
        ],
        totals: {
          charges: 30000,
          adjustments: 0,
          payments: 0,
          balance: 30000
        },
        dates: {
          serviceDate: '2024-01-15'
        },
        provider: {
          name: 'Test Provider'
        },
        patient: {
          id: 'TEST123'
        },
        metadata: {
          docType: 'BILL',
          confidence: 0.9
        }
      };

      const result = await detector.detect(context);

      expect(result.triggered).toBe(false);
    });
  });
});