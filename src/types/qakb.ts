// Q&A Knowledge Base Types

export interface PolicyCitation {
  title: string;
  authority: "Federal" | "CMS" | "StateDOI" | "PayerPolicy";
  citation: string;
}

export interface AnswerCard {
  cardId: string;
  theme: string;
  question: string;
  intent: string;
  answer: string;
  checklist: string[];
  phoneScript: string;
  appealSnippet: string;
  sources: PolicyCitation[];
  meta: {
    version: string;
    lastUpdatedISO: string;
    author: string;
    confidence: number;
  };
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
    billed?: number; // in cents
    allowed?: number;
    planPaid?: number;
    patientResp?: number;
  };
  lines?: Array<{
    lineId: string;
    code?: string;
    modifiers?: string[];
    desc?: string;
    units?: number;
    charge?: number;
    allowed?: number;
    planPaid?: number;
    patientResp?: number;
    conf?: number;
  }>;
  notes?: string[];
}

export interface PhoneScript {
  title: string;
  body: string;
}

export interface AppealLetter {
  title: string;
  body: string;
}

export interface ChatResponse {
  answer: string;
  checklist: string[];
  phoneScripts: PhoneScript[];
  appealLetters: AppealLetter[];
  sources: PolicyCitation[];
  pricedSummary?: PricedSummary;
  confidence: {
    overall: number;
    ocr?: number;
    classification?: number;
  };
}

// OCR and Case Types
export interface OCRResult {
  text: string;
  confidence: number;
  metadata?: {
    documentType?: 'medical_bill' | 'eob' | 'insurance_card' | 'lab_result' | 'unknown';
    extractedFields?: {
      patientName?: string;
      policyNumber?: string;
      claimNumber?: string;
      dateOfService?: string;
      charges?: Array<{ description: string; amount: number }>;
      balanceDue?: number;
      providerName?: string;
      insurerName?: string;
    };
    processingTime?: number;
  };
}

export interface ExtractedLineItem {
  lineId: string;
  code?: {
    value: string;
    system: "CPT" | "HCPCS" | "REV" | "Other";
    confidence: number;
  };
  modifiers?: string[];
  description?: string;
  units?: number;
  charges?: {
    billed?: number;
    allowed?: number;
    planPaid?: number;
    patientResp?: number;
  };
  dos?: string;
  pos?: string;
  npi?: string;
  denialCodes?: Array<{
    code: string;
    type: "CARC" | "RARC" | "Other";
    description?: string;
  }>;
  raw?: string;
  confidence: number;
}

export interface CaseDocument {
  artifactId: string;
  filename: string;
  docType: "EOB" | "BILL" | "LETTER" | "PORTAL" | "UNKNOWN";
  pages: number;
  ocrText: string;
  ocrConf: number;
  lineItems: ExtractedLineItem[];
  totals?: {
    billed?: number;
    allowed?: number;
    planPaid?: number;
    patientResp?: number;
  };
  header?: {
    providerName?: string;
    npi?: string;
    claimId?: string;
    accountId?: string;
    payer?: string;
    serviceDates?: {
      start: string;
      end?: string;
    };
  };
}

export interface MergedCase {
  caseId: string;
  narrative: string;
  documents: CaseDocument[];
  benefits?: {
    planType?: "HMO" | "PPO" | "EPO" | "POS" | "HDHP" | "Other";
    network?: "IN" | "OUT" | "Unknown";
    deductible?: {
      individual?: number;
      family?: number;
      met?: number;
    };
    coinsurance?: number;
    copays?: { [svc: string]: number };
    oopMax?: {
      individual?: number;
      family?: number;
      met?: number;
    };
    secondaryCoverage?: boolean;
    priorAuthRequired?: boolean;
    referralRequired?: boolean;
  };
  inferred?: {
    facility?: "HospitalOP" | "ASC" | "Office" | "ER" | "Freestanding" | "Unknown";
    emergency?: boolean;
    nsaCandidate?: boolean;
    ancillary?: string[];
    themes?: string[];
  };
  matchedLineItems?: ExtractedLineItem[];
  consolidatedTotals?: {
    billed: number;
    allowed: number;
    planPaid: number;
    patientResp: number;
  };
}

export interface ThemeClassification {
  themes: string[];
  confidence: number;
  matchingQuestions: Array<{
    cardId: string;
    question: string;
    confidence: number;
    keywordMatches: string[];
  }>;
}

// QAKB Cache and Retrieval
export interface QAKBCache {
  cards: Map<string, AnswerCard>;
  embeddings?: Map<string, Float32Array>;
  lastUpdated: string;
  version: string;
}

export interface QAKBQuery {
  narrative: string;
  themes?: string[];
  caseContext?: {
    hasDocuments: boolean;
    hasClaims: boolean;
    hasLineItems: boolean;
    emergency?: boolean;
    nsaCandidate?: boolean;
  };
}

export interface QAKBResult {
  primaryCard: AnswerCard;
  secondaryCards: AnswerCard[];
  confidence: number;
  matchReason: string;
}