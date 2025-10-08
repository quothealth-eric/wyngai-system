export interface PHIPattern {
  id: string;
  name: string;
  category: PHICategory;
  pattern: RegExp;
  confidence: number;
  replacement?: string;
  description: string;
}

export type PHICategory =
  | 'PERSON_NAME'
  | 'SSN'
  | 'PHONE'
  | 'EMAIL'
  | 'ADDRESS'
  | 'MEDICAL_RECORD_NUMBER'
  | 'ACCOUNT_NUMBER'
  | 'CERTIFICATE_LICENSE_NUMBER'
  | 'DEVICE_IDENTIFIER'
  | 'URL'
  | 'IP_ADDRESS'
  | 'BIOMETRIC'
  | 'PHOTO_IMAGE'
  | 'DATE_OF_BIRTH'
  | 'AGE_OVER_89'
  | 'GEOGRAPHIC_SUBDIVISION'
  | 'VEHICLE_IDENTIFIER'
  | 'HEALTH_PLAN_NUMBER';

export interface PHIDetectionResult {
  text: string;
  start: number;
  end: number;
  category: PHICategory;
  patternId: string;
  confidence: number;
  context: string;
  replacement: string;
}

export interface DeidentificationResult {
  originalText: string;
  deidentifiedText: string;
  detections: PHIDetectionResult[];
  statistics: {
    totalDetections: number;
    categoryCounts: Record<PHICategory, number>;
    confidenceAverage: number;
  };
  metadata: {
    processedAt: string;
    method: 'pattern_based' | 'ml_based' | 'hybrid';
    safeModeEnabled: boolean;
  };
}

export interface DeidentificationOptions {
  enableSafeMode: boolean; // More aggressive detection with lower confidence threshold
  preserveFormatting: boolean; // Maintain original text structure
  customPatterns?: PHIPattern[];
  excludeCategories?: PHICategory[];
  replacementStrategy: 'generic' | 'consistent' | 'random';
  confidenceThreshold: number;
}