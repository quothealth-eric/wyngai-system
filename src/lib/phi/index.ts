// Main PHI exports
export { PHIDeidentifier } from './deidentifier';
export { PHIPatterns } from './patterns';
import { PHIDeidentifier } from './deidentifier';

// Type exports
export type {
  PHIPattern,
  PHICategory,
  PHIDetectionResult,
  DeidentificationResult,
  DeidentificationOptions
} from './types';

// Utility function to create a deidentifier
export function createPHIDeidentifier(): PHIDeidentifier {
  return new PHIDeidentifier();
}

// Quick deidentification function for simple use cases
export function deidentifyText(text: string, enableSafeMode: boolean = true): string {
  const deidentifier = new PHIDeidentifier();
  const result = deidentifier.deidentify(text, {
    enableSafeMode,
    preserveFormatting: true,
    confidenceThreshold: enableSafeMode ? 0.6 : 0.7,
    replacementStrategy: 'generic'
  });

  return result.deidentifiedText;
}

// Validate text for PHI compliance
export function validatePHICompliance(text: string): {
  isCompliant: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  issues: number;
} {
  const deidentifier = new PHIDeidentifier();
  const validation = deidentifier.validateDeidentification(text);

  return {
    isCompliant: validation.isValid,
    riskLevel: validation.riskLevel,
    issues: validation.remainingPHI.length
  };
}