import { NoBenefitsDetectionEngine } from '@/lib/detect/engine';
import { DetectionContext } from '@/lib/detect/types';

describe('NoBenefitsDetectionEngine', () => {
  let engine: NoBenefitsDetectionEngine;

  beforeEach(() => {
    engine = new NoBenefitsDetectionEngine();
  });

  describe('runAllDetections', () => {
    it('should run all detection rules', async () => {
      const context: DetectionContext = {
        lineItems: [
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 15000,
            serviceDate: '2024-01-15',
            units: 1
          }
        ],
        totals: {
          charges: 15000,
          adjustments: 0,
          payments: 0,
          balance: 15000
        },
        dates: {
          serviceDate: '2024-01-15'
        },
        provider: {
          name: 'Test Provider',
          npi: '1234567890'
        },
        patient: {
          id: 'TEST123'
        },
        metadata: {
          docType: 'BILL',
          confidence: 0.9
        }
      };

      const results = await engine.runAllDetections(context);

      expect(results).toHaveLength(19); // All 19 detectors
      expect(results.every(r => r.ruleId)).toBe(true);
      expect(results.every(r => typeof r.triggered === 'boolean')).toBe(true);
      expect(results.every(r => typeof r.confidence === 'number')).toBe(true);
    });

    it('should detect duplicate charges', async () => {
      const context: DetectionContext = {
        lineItems: [
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 15000,
            serviceDate: '2024-01-15',
            units: 1
          },
          {
            code: '99213',
            description: 'Office visit level 3',
            amount: 15000,
            serviceDate: '2024-01-15',
            units: 1
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

      const results = await engine.runAllDetections(context);
      const duplicatesResult = results.find(r => r.ruleId === 'DUPLICATES');

      expect(duplicatesResult).toBeDefined();
      expect(duplicatesResult!.triggered).toBe(true);
      expect(duplicatesResult!.potentialSavings).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      const invalidContext = {} as DetectionContext;

      const results = await engine.runAllDetections(invalidContext);

      expect(results).toHaveLength(19);
      // Some detectors might fail, but engine should continue
      expect(results.every(r => r.ruleId)).toBe(true);
    });
  });

  describe('runDetection', () => {
    it('should run a specific detection rule', async () => {
      const context: DetectionContext = {
        lineItems: [
          {
            code: '99213',
            description: 'Office visit',
            amount: 15000,
            serviceDate: '2024-01-15'
          }
        ],
        totals: {
          charges: 15000,
          adjustments: 0,
          payments: 0,
          balance: 15000
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

      const result = await engine.runDetection('DUPLICATES', context);

      expect(result.ruleId).toBe('DUPLICATES');
      expect(result.triggered).toBe(false); // No duplicates in this case
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should throw error for unknown rule', async () => {
      const context: DetectionContext = {
        lineItems: [],
        totals: { charges: 0, adjustments: 0, payments: 0, balance: 0 },
        dates: {},
        provider: {},
        patient: {},
        metadata: { docType: 'UNKNOWN', confidence: 0.5 }
      };

      await expect(engine.runDetection('UNKNOWN_RULE', context))
        .rejects
        .toThrow('Unknown detection rule: UNKNOWN_RULE');
    });
  });

  describe('getAvailableRules', () => {
    it('should return all available rules', () => {
      const rules = engine.getAvailableRules();

      expect(rules).toHaveLength(19);
      expect(rules.every(r => r.id)).toBe(true);
      expect(rules.every(r => r.name)).toBe(true);
      expect(rules.every(r => r.description)).toBe(true);
      expect(rules.every(r => r.category)).toBe(true);
      expect(rules.every(r => r.severity)).toBe(true);
      expect(rules.every(r => r.requiresBenefits === false)).toBe(true);
    });

    it('should return immutable rule list', () => {
      const rules1 = engine.getAvailableRules();
      const rules2 = engine.getAvailableRules();

      expect(rules1).not.toBe(rules2); // Different objects
      expect(rules1).toEqual(rules2); // Same content
    });
  });

  describe('getRulesByCategory', () => {
    it('should filter rules by CODING category', () => {
      const codingRules = engine.getRulesByCategory('CODING');

      expect(codingRules.length).toBeGreaterThan(0);
      expect(codingRules.every(r => r.category === 'CODING')).toBe(true);
    });

    it('should filter rules by BILLING category', () => {
      const billingRules = engine.getRulesByCategory('BILLING');

      expect(billingRules.length).toBeGreaterThan(0);
      expect(billingRules.every(r => r.category === 'BILLING')).toBe(true);
    });

    it('should filter rules by CLINICAL category', () => {
      const clinicalRules = engine.getRulesByCategory('CLINICAL');

      expect(clinicalRules.length).toBeGreaterThan(0);
      expect(clinicalRules.every(r => r.category === 'CLINICAL')).toBe(true);
    });

    it('should filter rules by POLICY category', () => {
      const policyRules = engine.getRulesByCategory('POLICY');

      expect(policyRules.length).toBeGreaterThan(0);
      expect(policyRules.every(r => r.category === 'POLICY')).toBe(true);
    });
  });

  describe('getRulesBySeverity', () => {
    it('should filter rules by HIGH severity', () => {
      const highSeverityRules = engine.getRulesBySeverity('HIGH');

      expect(highSeverityRules.length).toBeGreaterThan(0);
      expect(highSeverityRules.every(r => r.severity === 'HIGH')).toBe(true);
    });

    it('should filter rules by MEDIUM severity', () => {
      const mediumSeverityRules = engine.getRulesBySeverity('MEDIUM');

      expect(mediumSeverityRules.length).toBeGreaterThan(0);
      expect(mediumSeverityRules.every(r => r.severity === 'MEDIUM')).toBe(true);
    });

    it('should filter rules by LOW severity', () => {
      const lowSeverityRules = engine.getRulesBySeverity('LOW');

      expect(lowSeverityRules.length).toBeGreaterThan(0);
      expect(lowSeverityRules.every(r => r.severity === 'LOW')).toBe(true);
    });
  });

  describe('getDetectionStatistics', () => {
    it('should calculate statistics correctly', () => {
      const mockResults = [
        {
          ruleId: 'DUPLICATES',
          triggered: true,
          confidence: 0.9,
          message: 'Duplicates found',
          affectedItems: [],
          recommendedAction: 'Review',
          potentialSavings: 15000,
          evidence: []
        },
        {
          ruleId: 'UPCODING',
          triggered: true,
          confidence: 0.8,
          message: 'Upcoding detected',
          affectedItems: [],
          recommendedAction: 'Review',
          potentialSavings: 5000,
          evidence: []
        },
        {
          ruleId: 'UNBUNDLING',
          triggered: false,
          confidence: 0.95,
          message: 'No unbundling',
          affectedItems: [],
          recommendedAction: 'None',
          evidence: []
        }
      ];

      const stats = engine.getDetectionStatistics(mockResults);

      expect(stats.totalRules).toBe(3);
      expect(stats.triggeredRules).toBe(2);
      expect(stats.highSeverityTriggered).toBeGreaterThan(0);
      expect(stats.averageConfidence).toBe(0.85); // (0.9 + 0.8) / 2
      expect(stats.totalPotentialSavings).toBe(20000);
    });

    it('should handle no triggered rules', () => {
      const mockResults = [
        {
          ruleId: 'DUPLICATES',
          triggered: false,
          confidence: 0.95,
          message: 'No duplicates',
          affectedItems: [],
          recommendedAction: 'None',
          evidence: []
        }
      ];

      const stats = engine.getDetectionStatistics(mockResults);

      expect(stats.totalRules).toBe(1);
      expect(stats.triggeredRules).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.totalPotentialSavings).toBe(0);
    });
  });
});