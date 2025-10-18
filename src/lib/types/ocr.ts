type MoneyCents = number;

export interface FileRef {
  fileId: string;
  storagePath: string;
  mime: string;
  sizeBytes: number;
}

export interface ParsedLine {
  lineId: string;
  page: number;
  code?: string;
  codeSystem?: "CPT" | "HCPCS" | "REV" | "POS";
  modifiers?: string[];
  description?: string;
  units?: number;
  dos?: string; // YYYY-MM-DD, normalized
  pos?: string;
  revCode?: string;
  npi?: string;
  charge?: MoneyCents;
  allowed?: MoneyCents;
  planPaid?: MoneyCents;
  patientResp?: MoneyCents;
  bbox?: [number, number, number, number];
  conf?: number; // vendor confidence 0..1
  lowConf?: boolean; // set true if vendor disagreement or regex fails
}

export interface PricedSummary {
  header: {
    providerName?: string;
    NPI?: string;
    claimId?: string;
    accountId?: string;
    serviceDates?: { start?: string; end?: string };
    payer?: string;
  };
  totals: {
    billed?: MoneyCents;
    allowed?: MoneyCents;
    planPaid?: MoneyCents;
    patientResp?: MoneyCents;
  };
  lines: ParsedLine[];
}

export interface Detection {
  ruleKey: string; // e.g., "unbundling_ncci", "dup_lines", "facility_fee"
  severity: "info" | "warn" | "high";
  explanation: string; // plain English justification
  evidence?: {
    lineRefs?: string[];
    pageRefs?: number[];
  };
  citations?: {
    title: string;
    authority: "Federal" | "CMS" | "StateDOI" | "PayerPolicy";
    citation: string;
    url?: string;
  }[];
  savingsCents?: number; // potential reduction/refund
}

export interface AnalysisResult {
  caseId: string;
  pricedSummary: PricedSummary;
  detections: Detection[];
  savingsTotalCents: number;
}

export interface OCRPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
  lines: {
    text: string;
    bbox?: [number, number, number, number];
    confidence?: number;
  }[];
}

export interface OCRResult {
  vendor: 'google' | 'tesseract';
  pages: OCRPageResult[];
  processingTimeMs: number;
  success: boolean;
  error?: string;
}

export interface ReportDraft {
  summary: string;
  issues: string;
  nextSteps: string;
  appealLetter: string;
  phoneScript: string;
  checklist: string[];
}

export interface CaseReport {
  caseId: string;
  reportPath: string;
  draft: ReportDraft;
  generatedAt: string;
  finalizedAt?: string;
}

export interface EOBLine {
  lineId: string;
  page: number;
  dateOfService?: string;
  providerName?: string;
  serviceDescription?: string;
  procedureCode?: string;
  billed?: MoneyCents;
  allowed?: MoneyCents;
  planPaid?: MoneyCents;
  patientResp?: MoneyCents;
  deductible?: MoneyCents;
  copay?: MoneyCents;
  coinsurance?: MoneyCents;
  bbox?: [number, number, number, number];
  conf?: number;
  lowConf?: boolean;
}

export interface EOBSummary {
  header: {
    memberName?: string;
    memberId?: string;
    groupNumber?: string;
    claimNumber?: string;
    dateOfService?: { start?: string; end?: string };
    provider?: string;
    totalBilled?: MoneyCents;
    totalAllowed?: MoneyCents;
    totalPlanPaid?: MoneyCents;
    totalPatientResp?: MoneyCents;
  };
  lines: EOBLine[];
}

export interface InsurancePlan {
  carrierName?: string;
  planName?: string;
  memberId?: string;
  groupNumber?: string;
  effectiveDate?: string;
  planType?: 'HMO' | 'PPO' | 'EPO' | 'POS' | 'HDHP' | 'Other';
  inNetworkDeductible?: MoneyCents;
  outOfNetworkDeductible?: MoneyCents;
  inNetworkCoinsurance?: number; // percentage (0-100)
  outOfNetworkCoinsurance?: number; // percentage (0-100)
  copayPrimary?: MoneyCents;
  copaySpecialist?: MoneyCents;
  copayUrgentCare?: MoneyCents;
  copayER?: MoneyCents;
  outOfPocketMax?: MoneyCents;
}

export interface LineMatch {
  billLineId: string;
  eobLineId?: string;
  matchConfidence: number; // 0-1
  matchType: 'exact' | 'fuzzy' | 'manual' | 'unmatched';
  allowedBasisSavings?: MoneyCents;
}

export interface EnhancedAnalysisResult extends AnalysisResult {
  eobSummary?: EOBSummary;
  insurancePlan?: InsurancePlan;
  lineMatches?: LineMatch[];
  allowedBasisSavingsCents?: number;
}