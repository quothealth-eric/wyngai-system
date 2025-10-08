// Main detection library exports
export { NoBenefitsDetectionEngine } from './engine';
import { NoBenefitsDetectionEngine } from './engine';

// Type exports
export type {
  DetectionRule,
  DetectionContext,
  DetectionResult,
  DetectionEngine
} from './types';
import type { DetectionContext } from './types';

// Individual detector exports
export { DuplicatesDetector } from './detectors/duplicates';
export { UnbundlingDetector } from './detectors/unbundling';
export { ModifierMisuseDetector } from './detectors/modifier_misuse';
export { UpcodingDetector } from './detectors/upcoding';
export { FrequencyLimitsDetector } from './detectors/frequency_limits';
export { GenderSpecificDetector } from './detectors/gender_specific';
export { AgeInappropriateDetector } from './detectors/age_inappropriate';
export { ExperimentalUnprovenDetector } from './detectors/experimental_unproven';
export { MutuallyExclusiveDetector } from './detectors/mutually_exclusive';
export { BalanceBillingDetector } from './detectors/balance_billing';
export { MedicalNecessityDetector } from './detectors/medical_necessity';
export { IncorrectUnitsDetector } from './detectors/incorrect_units';
export { LocationMismatchDetector } from './detectors/location_mismatch';
export { TimeProximityDetector } from './detectors/time_proximity';
export { DateInconsistenciesDetector } from './detectors/date_inconsistencies';
export { PricingAnomaliesDetector } from './detectors/pricing_anomalies';
export { ProviderAnomaliesDetector } from './detectors/provider_anomalies';
export { DocumentationGapsDetector } from './detectors/documentation_gaps';
export { OutlierPatternsDetector } from './detectors/outlier_patterns';

// Utility function to create a detection engine
export function createDetectionEngine(): NoBenefitsDetectionEngine {
  return new NoBenefitsDetectionEngine();
}

// Utility function to validate detection context
export function validateDetectionContext(context: DetectionContext): string[] {
  const errors: string[] = [];

  if (!context.lineItems || context.lineItems.length === 0) {
    errors.push('Detection context must include line items');
  }

  if (!context.totals) {
    errors.push('Detection context must include totals');
  }

  if (!context.metadata) {
    errors.push('Detection context must include metadata');
  }

  return errors;
}