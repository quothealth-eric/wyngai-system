export type MoneyCents = number;

export interface DocumentArtifact {
  artifactId: string;
  filename: string;
  mime: string;
  docType: "EOB" | "BILL" | "LETTER" | "PORTAL" | "UNKNOWN";
  pages: number;
  ocrConf?: number;
}

export interface BenefitsContext {
  planType?: "HMO" | "PPO" | "EPO" | "POS" | "HDHP" | "Other";
  network?: "IN" | "OUT" | "Unknown";
  deductible?: {
    individual?: MoneyCents;
    family?: MoneyCents;
    met?: MoneyCents;
  };
  coinsurance?: number;
  copays?: { [svc: string]: MoneyCents };
  oopMax?: {
    individual?: MoneyCents;
    family?: MoneyCents;
    met?: MoneyCents;
  };
  secondaryCoverage?: boolean;
  priorAuthRequired?: boolean;
  referralRequired?: boolean;
}

export interface UnifiedChatCase {
  caseId: string;
  artifacts: DocumentArtifact[];
  narrative: {
    text: string;
    themeHints?: string[];
  };
  benefits?: BenefitsContext;
  inferred?: {
    facility?: "HospitalOP" | "ASC" | "Office" | "ER" | "Freestanding" | "Unknown";
    emergency?: boolean;
    nsaCandidate?: boolean;
    ancillary?: string[];
  };
}

export interface PolicyCitation {
  title: string;
  authority: "Federal" | "StateDOI" | "CMS" | "PayerPolicy";
  citation: string;
}

export interface ScriptTemplate {
  title: string;
  body: string;
}

export interface AppealLetter {
  title: string;
  body: string;
}

export interface PricedSummary {
  header: {
    providerName?: string;
    NPI?: string;
    claimId?: string;
    accountId?: string;
    dos?: {
      start: string;
      end?: string;
    };
    payer?: string;
  };
  totals?: {
    billed?: MoneyCents;
    allowed?: MoneyCents;
    planPaid?: MoneyCents;
    patientResp?: MoneyCents;
  };
  lines?: Array<{
    lineId: string;
    code?: string;
    modifiers?: string[];
    desc?: string;
    units?: number;
    charge?: MoneyCents;
    allowed?: MoneyCents;
    planPaid?: MoneyCents;
    patientResp?: MoneyCents;
    conf?: number;
  }>;
  notes?: string[];
}

export interface ChatDetection {
  category: string;
  severity: "info" | "warn" | "high";
  explanation: string;
  evidence?: {
    snippets?: string[];
    lineRefs?: string[];
    pages?: number[];
  };
  policyCitations?: PolicyCitation[];
}

export interface ChatAnswer {
  caseId: string;
  pricedSummary?: PricedSummary;
  keyFacts?: string[];
  detections?: ChatDetection[];
  answer: string;
  checklist: string[];
  phoneScripts: ScriptTemplate[];
  appealLetters: AppealLetter[];
  sources: PolicyCitation[];
  confidence: {
    overall: number;
    ocr?: number;
  };
}

// Theme bank structure for routing
export interface ThemeCategory {
  category: string;
  subcategories?: string[];
  questions: Array<{
    question: string;
    keywords: string[];
    priority: "high" | "medium" | "low";
  }>;
}

export interface ThemeBank {
  categories: ThemeCategory[];
}

// OCR field extraction interfaces
export interface OCRFieldExtraction {
  artifactId: string;
  page: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  conf: number;
  text: string;
}

export interface ExtractedLineItem {
  lineId: string;
  code?: {
    value: string;
    system: "CPT" | "HCPCS" | "REV" | "Other";
    ocr?: OCRFieldExtraction;
  };
  modifiers?: Array<{
    value: string;
    ocr?: OCRFieldExtraction;
  }>;
  description?: {
    text: string;
    ocr?: OCRFieldExtraction;
  };
  units?: {
    value: number;
    ocr?: OCRFieldExtraction;
  };
  charges?: {
    billed?: { amount: MoneyCents; ocr?: OCRFieldExtraction };
    allowed?: { amount: MoneyCents; ocr?: OCRFieldExtraction };
    planPaid?: { amount: MoneyCents; ocr?: OCRFieldExtraction };
    patientResp?: { amount: MoneyCents; ocr?: OCRFieldExtraction };
  };
  dos?: {
    date: string;
    ocr?: OCRFieldExtraction;
  };
  pos?: {
    code: string;
    ocr?: OCRFieldExtraction;
  };
  npi?: {
    value: string;
    ocr?: OCRFieldExtraction;
  };
  denialCodes?: Array<{
    code: string;
    type: "CARC" | "RARC" | "Other";
    description?: string;
    ocr?: OCRFieldExtraction;
  }>;
}

export interface ExtractedDocumentHeader {
  memberInfo?: {
    memberId?: { value: string; ocr?: OCRFieldExtraction };
    memberName?: { value: string; ocr?: OCRFieldExtraction };
  };
  claimInfo?: {
    claimId?: { value: string; ocr?: OCRFieldExtraction };
    accountId?: { value: string; ocr?: OCRFieldExtraction };
  };
  payerInfo?: {
    payerName?: { value: string; ocr?: OCRFieldExtraction };
    planName?: { value: string; ocr?: OCRFieldExtraction };
  };
  providerInfo?: {
    providerName?: { value: string; ocr?: OCRFieldExtraction };
    npi?: { value: string; ocr?: OCRFieldExtraction };
    tin?: { value: string; ocr?: OCRFieldExtraction };
    facilityName?: { value: string; ocr?: OCRFieldExtraction };
  };
  serviceDates?: {
    start: { date: string; ocr?: OCRFieldExtraction };
    end?: { date: string; ocr?: OCRFieldExtraction };
  };
  appealInfo?: {
    address?: { text: string; ocr?: OCRFieldExtraction };
    deadline?: { date: string; ocr?: OCRFieldExtraction };
  };
}

export interface ExtractedDocumentTotals {
  billed?: { amount: MoneyCents; ocr?: OCRFieldExtraction };
  allowed?: { amount: MoneyCents; ocr?: OCRFieldExtraction };
  planPaid?: { amount: MoneyCents; ocr?: OCRFieldExtraction };
  patientResp?: { amount: MoneyCents; ocr?: OCRFieldExtraction };
  adjustments?: { amount: MoneyCents; ocr?: OCRFieldExtraction };
  payments?: { amount: MoneyCents; ocr?: OCRFieldExtraction };
}

// Chat processing context
export interface ChatProcessingContext {
  case: UnifiedChatCase;
  extractedHeaders: Map<string, ExtractedDocumentHeader>;
  extractedTotals: Map<string, ExtractedDocumentTotals>;
  extractedLineItems: Map<string, ExtractedLineItem[]>;
  themeClassification: string[];
  confidenceScores: {
    overallOCR: number;
    fieldExtraction: number;
    themeClassification: number;
  };
}