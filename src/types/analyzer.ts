export type MoneyCents = number;

export interface DocumentArtifact {
  artifactId: string;
  filename: string;
  docType: "EOB" | "BILL" | "LETTER" | "PORTAL" | "UNKNOWN";
  pages: number;
  ocrConf?: number;
  mimeType?: string;
  sizeBytes?: number;
}

export interface Narrative {
  text: string;
  tags?: string[]; // e.g., ["ER","anesthesia","surpriseBill"]
}

export interface BenefitsContext {
  planType?: "HMO" | "PPO" | "EPO" | "HDHP" | "Other";
  network?: "IN" | "OUT" | "Unknown";
  deductible?: { individual?: MoneyCents; family?: MoneyCents; met?: MoneyCents };
  coinsurance?: number; // 0..1
  copays?: { [service: string]: MoneyCents };
  oopMax?: { individual?: MoneyCents; family?: MoneyCents; met?: MoneyCents };
  secondaryCoverage?: boolean;
  priorAuthRequired?: boolean;
  referralRequired?: boolean;
}

export interface UnifiedCaseInput {
  caseId: string;
  artifacts: DocumentArtifact[];
  narrative: Narrative;
  benefits?: BenefitsContext;
  inferred?: {
    facilityType?: "HospitalOP" | "Freestanding" | "ASC" | "Office" | "ER" | "Unknown";
    emergency?: boolean;
    nsaCandidate?: boolean;
    ancillaryVendors?: string[];
  };
}

export interface DocumentMeta {
  sourceFilename: string;
  docType: "EOB" | "BILL" | "LETTER" | "PORTAL" | "UNKNOWN";
  pages: number;
  payer?: string;
  providerName?: string;
  providerNPI?: string;
  providerTIN?: string;
  claimId?: string;
  accountId?: string;
  serviceDates?: { start: string; end?: string };
  totals?: {
    billed?: MoneyCents;
    allowed?: MoneyCents;
    planPaid?: MoneyCents;
    patientResponsibility?: MoneyCents;
  };
  appeal?: { address?: string; deadlineDateISO?: string };
  carcRarc?: CarcRarcCode[];
  facilityType?: string;
  preventiveIndicators?: string[];
}

export interface LineItem {
  lineId: string;
  description?: string;
  code?: { system: "CPT" | "HCPCS" | "ICD10" | "REV" | "POS" | "UNKNOWN"; value: string };
  modifiers?: string[];
  units?: number;
  revenueCode?: string;
  pos?: string;
  npi?: string;
  charge?: MoneyCents;
  allowed?: MoneyCents;
  planPaid?: MoneyCents;
  patientResp?: MoneyCents;
  dos?: string;
  raw?: string;
  ocr?: { artifactId: string; page: number; bbox?: [number,number,number,number]; conf?: number };
}

export interface PolicyCitation {
  title: string;       // e.g., "No Surprises Act — facility-based ancillary"
  citation: string;    // e.g., section or URL slug to our corpus
  authority: "Federal" | "StateDOI" | "PayerPolicy" | "CMS";
}

export interface Detection {
  detectionId: string;
  category:
    | "Duplicate" | "Unbundling" | "Modifier" | "ProfTechSplit" | "FacilityFee"
    | "NSA_Ancillary" | "NSA_ER" | "Preventive" | "GlobalSurgery"
    | "DrugUnits" | "TherapyUnits" | "TimelyFiling" | "COB" | "DemographicMismatch"
    | "MathError" | "EOBZeroStillBilled" | "NonProviderFee" | "ObsVsInpatient"
    | "MissingItemized" | "GroundAmbulance" | "BenefitsMath";
  severity: "info" | "warn" | "high";
  explanation: string;       // plain-English
  mathDelta?: { expected?: MoneyCents; observed?: MoneyCents; breakdown?: any };
  evidence: { lineRefs?: string[]; snippets?: string[]; pageRefs?: number[] };
  suggestedQuestions?: string[];
  policyCitations?: PolicyCitation[];
  confidence?: number;
}

export interface ScriptTemplate {
  title: string;
  body: string; // populated with fields like {claimId}, {allowed}
}

export interface AppealLetter {
  title: string;
  body: string;         // full letter with placeholders
  attachments?: string[];
}

export interface PricedSummary {
  header: {
    providerName?: string; NPI?: string; claimId?: string; accountId?: string;
    serviceDates?: { start: string; end?: string };
    payer?: string; networkAssumption?: "IN" | "OUT" | "Unknown";
  };
  totals: { billed?: MoneyCents; allowed?: MoneyCents; planPaid?: MoneyCents; patientResp?: MoneyCents };
  lines: Array<Pick<LineItem,"lineId"|"code"|"modifiers"|"description"|"units"|"dos"|"pos"|"revenueCode"|"npi"|"charge"|"allowed"|"planPaid"|"patientResp"> & { conf?: number }>;
  notes?: string[];
}

export interface Guidance {
  phoneScripts: ScriptTemplate[];
  appealLetters: AppealLetter[];
}

export interface NextAction {
  label: string;
  dueDateISO?: string;
}

export interface AnalyzerResult {
  caseInputEcho: Omit<UnifiedCaseInput,"artifacts">; // no raw PHI echoes
  documentMeta: DocumentMeta[];
  lineItems: LineItem[];
  pricedSummary: PricedSummary;
  detections: Detection[];
  guidance: Guidance;
  nextActions: NextAction[];
  confidence: { overall: number; sections?: { [k: string]: number } };
  complianceFooters: string[];
  emailGate?: { emailOk: boolean; message?: string; redirectUrl?: string };
  benefitsContext?: BenefitsContext;
}

// Additional types for internal processing (preserved from existing)
export interface CarcRarcCode {
  code: string;
  description: string;
  category: "CARC" | "RARC";
}

export interface NcciEdit {
  column1: string;
  column2: string;
  modifier: string;
  effective: string;
}

export interface OCRConfidence {
  page: number;
  bbox?: [number, number, number, number];
  confidence: number;
  rawText: string;
}

export interface DocumentStructure {
  header: { [key: string]: string };
  totals: { [key: string]: MoneyCents };
  lineItems: LineItem[];
  remarkCodes: CarcRarcCode[];
  appealInfo?: {
    address: string;
    deadline: string;
  };
}

export interface DetectionRule {
  id: string;
  name: string;
  category: Detection['category'];
  severity: Detection['severity'];
  check: (structure: DocumentStructure, benefits?: BenefitsContext) => Detection | null;
  requiresBenefits: boolean;
}

// Chat-specific types
export interface ThemeBank {
  themes: Array<{
    themeId: string;
    themeName: string;
    description: string;
    questions: string[];
  }>;
}

export interface AnswerCard {
  questionId: string;
  question: string;
  themeId: string;
  answer: string; // 120-220 words
  checklist: string[]; // 3-7 concrete steps
  phoneScript?: string; // ≤140 words
  appealSnippet?: string; // ≤200 words when relevant
  sources: PolicyCitation[]; // ≥2 citations
  meta: {
    version: string;
    lastUpdatedISO: string;
    author: string;
    confidence: number; // 0..1
  };
}

export interface ChatAnswer {
  answer: string;
  checklist: string[];
  phoneScripts: string[];
  appealSnippet?: string;
  sources: PolicyCitation[];
  pricedSummary?: PricedSummary; // If claim math exists
  confidence: number;
  matchedQuestions: Array<{
    question: string;
    similarity: number;
  }>;
}

export interface SemanticMatch {
  questionId: string;
  question: string;
  similarity: number;
  themeId: string;
}

export interface FileUploadConstraints {
  maxFileSize: number; // 20MB in bytes
  maxTotalSize: number; // 100MB in bytes
  allowedTypes: string[];
  maxFiles: number;
}

export interface UploadProgress {
  fileId: string;
  filename: string;
  progress: number; // 0-100
  status: 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}