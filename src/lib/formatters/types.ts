import { MoneyCents } from '@/types/common';
import { DetectionResult } from '@/lib/detect/types';

export interface FormattedTable {
  title: string;
  subtitle?: string;
  columns: TableColumn[];
  rows: TableRow[];
  summary?: TableSummary;
  metadata?: {
    confidence: number;
    source: string;
    extractedAt: string;
  };
}

export interface TableColumn {
  key: string;
  label: string;
  type: 'text' | 'currency' | 'date' | 'number' | 'boolean';
  align?: 'left' | 'center' | 'right';
  width?: number;
}

export interface TableRow {
  id: string;
  cells: { [key: string]: TableCell };
  highlighted?: boolean;
  issue?: string;
}

export interface TableCell {
  value: any;
  displayValue?: string;
  formatted?: string;
  confidence?: number;
  highlight?: 'warning' | 'error' | 'success';
}

export interface TableSummary {
  totalCharges?: MoneyCents;
  totalAdjustments?: MoneyCents;
  totalPayments?: MoneyCents;
  patientBalance?: MoneyCents;
  itemCount: number;
  detectionCount?: number;
  potentialSavings?: MoneyCents;
}

export interface FormattedDetectionSummary {
  title: string;
  totalRulesRun: number;
  triggeredRules: number;
  highSeverityCount: number;
  totalPotentialSavings: MoneyCents;
  averageConfidence: number;
  detectionsByCategory: {
    category: string;
    count: number;
    highestSeverity: string;
  }[];
  topDetections: FormattedDetection[];
}

export interface FormattedDetection {
  ruleId: string;
  name: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
  message: string;
  affectedItems: string[];
  potentialSavings?: MoneyCents;
  recommendedAction: string;
  evidence: {
    field: string;
    value: string;
    location: string;
  }[];
  citations?: {
    title: string;
    authority: string;
    citation: string;
  }[];
}

export interface OutputFormatter {
  formatLineItems(lineItems: any[], confidence: number): FormattedTable;
  formatDetections(results: DetectionResult[]): FormattedDetectionSummary;
  formatProviderInfo(provider: any): FormattedTable;
  formatFinancialSummary(totals: any): FormattedTable;
}