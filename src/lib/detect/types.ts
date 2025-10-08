import { MoneyCents, PolicyCitation } from '@/types/common';
import { LineItem } from '@/types/analyzer';

export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  category: 'CODING' | 'BILLING' | 'POLICY' | 'CLINICAL';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  requiresBenefits: boolean;
}

export interface DetectionContext {
  lineItems: LineItem[];
  totals: {
    charges: MoneyCents;
    adjustments: MoneyCents;
    payments: MoneyCents;
    balance: MoneyCents;
  };
  dates: {
    serviceDate?: string;
    billingDate?: string;
    dueDate?: string;
  };
  provider: {
    npi?: string;
    name?: string;
    specialty?: string;
  };
  patient: {
    id?: string;
    name?: string;
  };
  metadata: {
    docType: string;
    confidence: number;
  };
}

export interface DetectionResult {
  ruleId: string;
  triggered: boolean;
  confidence: number;
  message: string;
  affectedItems: string[];
  recommendedAction: string;
  potentialSavings?: MoneyCents;
  citations?: PolicyCitation[];
  evidence: {
    field: string;
    value: string;
    location: string;
  }[];
}

export interface DetectionEngine {
  runAllDetections(context: DetectionContext): Promise<DetectionResult[]>;
  runDetection(ruleId: string, context: DetectionContext): Promise<DetectionResult>;
  getAvailableRules(): DetectionRule[];
}