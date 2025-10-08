import { DetectionEngine, DetectionRule, DetectionResult, DetectionContext } from './types';

// Import all detectors
import { DuplicatesDetector } from './detectors/duplicates';
import { UnbundlingDetector } from './detectors/unbundling';
import { ModifierMisuseDetector } from './detectors/modifier_misuse';
import { UpcodingDetector } from './detectors/upcoding';
import { FrequencyLimitsDetector } from './detectors/frequency_limits';
import { GenderSpecificDetector } from './detectors/gender_specific';
import { AgeInappropriateDetector } from './detectors/age_inappropriate';
import { ExperimentalUnprovenDetector } from './detectors/experimental_unproven';
import { MutuallyExclusiveDetector } from './detectors/mutually_exclusive';
import { BalanceBillingDetector } from './detectors/balance_billing';
import { MedicalNecessityDetector } from './detectors/medical_necessity';
import { IncorrectUnitsDetector } from './detectors/incorrect_units';
import { LocationMismatchDetector } from './detectors/location_mismatch';
import { TimeProximityDetector } from './detectors/time_proximity';
import { DateInconsistenciesDetector } from './detectors/date_inconsistencies';
import { PricingAnomaliesDetector } from './detectors/pricing_anomalies';
import { ProviderAnomaliesDetector } from './detectors/provider_anomalies';
import { DocumentationGapsDetector } from './detectors/documentation_gaps';
import { OutlierPatternsDetector } from './detectors/outlier_patterns';

export class NoBenefitsDetectionEngine implements DetectionEngine {
  private readonly detectors = new Map<string, any>([
    [DuplicatesDetector.RULE_ID, new DuplicatesDetector()],
    [UnbundlingDetector.RULE_ID, new UnbundlingDetector()],
    [ModifierMisuseDetector.RULE_ID, new ModifierMisuseDetector()],
    [UpcodingDetector.RULE_ID, new UpcodingDetector()],
    [FrequencyLimitsDetector.RULE_ID, new FrequencyLimitsDetector()],
    [GenderSpecificDetector.RULE_ID, new GenderSpecificDetector()],
    [AgeInappropriateDetector.RULE_ID, new AgeInappropriateDetector()],
    [ExperimentalUnprovenDetector.RULE_ID, new ExperimentalUnprovenDetector()],
    [MutuallyExclusiveDetector.RULE_ID, new MutuallyExclusiveDetector()],
    [BalanceBillingDetector.RULE_ID, new BalanceBillingDetector()],
    [MedicalNecessityDetector.RULE_ID, new MedicalNecessityDetector()],
    [IncorrectUnitsDetector.RULE_ID, new IncorrectUnitsDetector()],
    [LocationMismatchDetector.RULE_ID, new LocationMismatchDetector()],
    [TimeProximityDetector.RULE_ID, new TimeProximityDetector()],
    [DateInconsistenciesDetector.RULE_ID, new DateInconsistenciesDetector()],
    [PricingAnomaliesDetector.RULE_ID, new PricingAnomaliesDetector()],
    [ProviderAnomaliesDetector.RULE_ID, new ProviderAnomaliesDetector()],
    [DocumentationGapsDetector.RULE_ID, new DocumentationGapsDetector()],
    [OutlierPatternsDetector.RULE_ID, new OutlierPatternsDetector()]
  ]);

  private readonly rules: DetectionRule[] = [
    {
      id: DuplicatesDetector.RULE_ID,
      name: 'Duplicate Charges',
      description: 'Detects identical procedures billed multiple times inappropriately',
      category: 'BILLING',
      severity: 'HIGH',
      requiresBenefits: false
    },
    {
      id: UnbundlingDetector.RULE_ID,
      name: 'Unbundling Violations',
      description: 'Identifies procedures that should be billed as bundled services',
      category: 'CODING',
      severity: 'HIGH',
      requiresBenefits: false
    },
    {
      id: ModifierMisuseDetector.RULE_ID,
      name: 'Modifier Misuse',
      description: 'Detects inappropriate use of procedure modifiers',
      category: 'CODING',
      severity: 'MEDIUM',
      requiresBenefits: false
    },
    {
      id: UpcodingDetector.RULE_ID,
      name: 'Upcoding',
      description: 'Identifies procedures billed at higher complexity than justified',
      category: 'CODING',
      severity: 'HIGH',
      requiresBenefits: false
    },
    {
      id: FrequencyLimitsDetector.RULE_ID,
      name: 'Frequency Limit Violations',
      description: 'Detects services exceeding allowed frequency limits',
      category: 'POLICY',
      severity: 'MEDIUM',
      requiresBenefits: false
    },
    {
      id: GenderSpecificDetector.RULE_ID,
      name: 'Gender-Specific Procedures',
      description: 'Identifies gender-specific procedures requiring verification',
      category: 'CLINICAL',
      severity: 'HIGH',
      requiresBenefits: false
    },
    {
      id: AgeInappropriateDetector.RULE_ID,
      name: 'Age-Inappropriate Procedures',
      description: 'Detects procedures outside appropriate age ranges',
      category: 'CLINICAL',
      severity: 'MEDIUM',
      requiresBenefits: false
    },
    {
      id: ExperimentalUnprovenDetector.RULE_ID,
      name: 'Experimental/Unproven Procedures',
      description: 'Identifies experimental, investigational, or unproven treatments',
      category: 'POLICY',
      severity: 'HIGH',
      requiresBenefits: false
    },
    {
      id: MutuallyExclusiveDetector.RULE_ID,
      name: 'Mutually Exclusive Procedures',
      description: 'Detects procedures that cannot be performed together',
      category: 'CODING',
      severity: 'HIGH',
      requiresBenefits: false
    },
    {
      id: BalanceBillingDetector.RULE_ID,
      name: 'Balance Billing Violations',
      description: 'Identifies potential inappropriate balance billing practices',
      category: 'BILLING',
      severity: 'HIGH',
      requiresBenefits: false
    },
    {
      id: MedicalNecessityDetector.RULE_ID,
      name: 'Medical Necessity Concerns',
      description: 'Flags procedures requiring medical necessity documentation',
      category: 'CLINICAL',
      severity: 'MEDIUM',
      requiresBenefits: false
    },
    {
      id: IncorrectUnitsDetector.RULE_ID,
      name: 'Incorrect Units',
      description: 'Detects incorrect unit billing for time-based and quantity procedures',
      category: 'BILLING',
      severity: 'MEDIUM',
      requiresBenefits: false
    },
    {
      id: LocationMismatchDetector.RULE_ID,
      name: 'Location/Procedure Mismatch',
      description: 'Identifies procedures inappropriate for place of service',
      category: 'BILLING',
      severity: 'MEDIUM',
      requiresBenefits: false
    },
    {
      id: TimeProximityDetector.RULE_ID,
      name: 'Time Proximity Issues',
      description: 'Detects services performed too close together in time',
      category: 'BILLING',
      severity: 'MEDIUM',
      requiresBenefits: false
    },
    {
      id: DateInconsistenciesDetector.RULE_ID,
      name: 'Date Inconsistencies',
      description: 'Identifies inconsistent or invalid dates in billing',
      category: 'BILLING',
      severity: 'HIGH',
      requiresBenefits: false
    },
    {
      id: PricingAnomaliesDetector.RULE_ID,
      name: 'Pricing Anomalies',
      description: 'Detects unusual pricing patterns and amounts',
      category: 'BILLING',
      severity: 'MEDIUM',
      requiresBenefits: false
    },
    {
      id: ProviderAnomaliesDetector.RULE_ID,
      name: 'Provider Anomalies',
      description: 'Identifies provider-related concerns and scope of practice issues',
      category: 'CLINICAL',
      severity: 'MEDIUM',
      requiresBenefits: false
    },
    {
      id: DocumentationGapsDetector.RULE_ID,
      name: 'Documentation Gaps',
      description: 'Detects missing or inconsistent documentation',
      category: 'BILLING',
      severity: 'MEDIUM',
      requiresBenefits: false
    },
    {
      id: OutlierPatternsDetector.RULE_ID,
      name: 'Statistical Outlier Patterns',
      description: 'Identifies statistically unusual patterns in billing data',
      category: 'BILLING',
      severity: 'LOW',
      requiresBenefits: false
    }
  ];

  public async runAllDetections(context: DetectionContext): Promise<DetectionResult[]> {
    console.log('🔍 Running no-benefits detection engine...');

    const results: DetectionResult[] = [];
    const startTime = Date.now();

    // Run all detectors in parallel for better performance
    const detectionPromises = Array.from(this.detectors.entries()).map(async ([ruleId, detector]) => {
      try {
        console.log(`  ⚡ Running ${ruleId} detector...`);
        const result = await detector.detect(context);

        if (result.triggered) {
          console.log(`  ✅ ${ruleId}: ${result.message}`);
        }

        return result;
      } catch (error) {
        console.error(`  ❌ ${ruleId} detector failed:`, error);

        // Return a failure result instead of throwing
        return {
          ruleId,
          triggered: false,
          confidence: 0,
          message: `Detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          affectedItems: [],
          recommendedAction: 'Manual review required due to detection engine error',
          evidence: []
        };
      }
    });

    const allResults = await Promise.all(detectionPromises);
    results.push(...allResults);

    const endTime = Date.now();
    const triggeredCount = results.filter(r => r.triggered).length;

    console.log(`🏁 Detection completed in ${endTime - startTime}ms`);
    console.log(`📊 ${triggeredCount}/${results.length} detectors triggered`);

    // Sort results by severity and confidence
    return this.sortResults(results);
  }

  public async runDetection(ruleId: string, context: DetectionContext): Promise<DetectionResult> {
    const detector = this.detectors.get(ruleId);

    if (!detector) {
      throw new Error(`Unknown detection rule: ${ruleId}`);
    }

    console.log(`🔍 Running ${ruleId} detector...`);

    try {
      const result = await detector.detect(context);

      if (result.triggered) {
        console.log(`✅ ${ruleId}: ${result.message}`);
      } else {
        console.log(`⚪ ${ruleId}: No issues detected`);
      }

      return result;
    } catch (error) {
      console.error(`❌ ${ruleId} detector failed:`, error);
      throw error;
    }
  }

  public getAvailableRules(): DetectionRule[] {
    return [...this.rules]; // Return a copy to prevent modification
  }

  public getRulesByCategory(category: 'CODING' | 'BILLING' | 'POLICY' | 'CLINICAL'): DetectionRule[] {
    return this.rules.filter(rule => rule.category === category);
  }

  public getRulesBySeverity(severity: 'HIGH' | 'MEDIUM' | 'LOW'): DetectionRule[] {
    return this.rules.filter(rule => rule.severity === severity);
  }

  public getDetectionStatistics(results: DetectionResult[]): {
    totalRules: number;
    triggeredRules: number;
    highSeverityTriggered: number;
    averageConfidence: number;
    totalPotentialSavings: number;
  } {
    const triggeredResults = results.filter(r => r.triggered);

    const highSeverityTriggered = triggeredResults.filter(r => {
      const rule = this.rules.find(rule => rule.id === r.ruleId);
      return rule?.severity === 'HIGH';
    }).length;

    const totalConfidence = triggeredResults.reduce((sum, r) => sum + r.confidence, 0);
    const averageConfidence = triggeredResults.length > 0 ? totalConfidence / triggeredResults.length : 0;

    const totalPotentialSavings = triggeredResults.reduce((sum, r) =>
      sum + (r.potentialSavings || 0), 0
    );

    return {
      totalRules: this.rules.length,
      triggeredRules: triggeredResults.length,
      highSeverityTriggered,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      totalPotentialSavings
    };
  }

  private sortResults(results: DetectionResult[]): DetectionResult[] {
    return results.sort((a, b) => {
      // First, prioritize triggered results
      if (a.triggered && !b.triggered) return -1;
      if (!a.triggered && b.triggered) return 1;

      // For triggered results, sort by severity then confidence
      if (a.triggered && b.triggered) {
        const aRule = this.rules.find(r => r.id === a.ruleId);
        const bRule = this.rules.find(r => r.id === b.ruleId);

        const severityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        const aSeverity = severityOrder[aRule?.severity || 'LOW'];
        const bSeverity = severityOrder[bRule?.severity || 'LOW'];

        if (aSeverity !== bSeverity) {
          return bSeverity - aSeverity; // Higher severity first
        }

        return b.confidence - a.confidence; // Higher confidence first
      }

      // For non-triggered results, sort by rule severity
      const aRule = this.rules.find(r => r.id === a.ruleId);
      const bRule = this.rules.find(r => r.id === b.ruleId);

      const severityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      const aSeverity = severityOrder[aRule?.severity || 'LOW'];
      const bSeverity = severityOrder[bRule?.severity || 'LOW'];

      return bSeverity - aSeverity;
    });
  }
}