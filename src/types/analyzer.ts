export type MoneyCents = number;

export interface DocumentMeta {
  sourceFilename: string;
  docType: "EOB" | "BILL" | "OTHER";
  pages: number;
  payer?: string;
  providerName?: string;
  providerNPI?: string;
  facilityType?: "HospitalOP" | "Freestanding" | "ASC" | "Office" | "Unknown";
  claimId?: string;
  accountId?: string;
  serviceDates?: { start: string; end?: string };
  totals?: {
    billed?: MoneyCents;
    allowed?: MoneyCents;
    planPaid?: MoneyCents;
    patientResponsibility?: MoneyCents;
  };
}

export interface LineItem {
  lineId: string;
  description?: string;
  code?: { system: "CPT" | "HCPCS" | "ICD10" | "REV" | "POS" | "UNKNOWN"; value: string };
  modifiers?: string[]; // e.g., ["26","TC","59","25"]
  units?: number;
  revenueCode?: string;
  pos?: string;
  charge?: MoneyCents;
  allowed?: MoneyCents;
  contractualAdjustment?: MoneyCents; // Amount written off by provider per contract
  planPaid?: MoneyCents;
  patientResp?: MoneyCents;
  dos?: string;
  raw?: string;
  ocr?: { page: number; bbox?: [number,number,number,number]; conf?: number };
}

export interface PolicyCitation {
  title: string;          // e.g., "No Surprises Act — facility-based ancillary"
  citation: string;       // e.g., section or URL slug to our corpus
  authority: "Federal" | "StateDOI" | "PayerPolicy" | "CMS" | "CaseLaw";
}

export interface Detection {
  detectionId: string;
  category:
    | "Duplicate"
    | "Unbundling"
    | "Modifier"
    | "ProfTechSplit"
    | "FacilityFee"
    | "NSA_Ancillary"
    | "NSA_ER"
    | "Preventive"
    | "GlobalSurgery"
    | "DrugUnits"
    | "TherapyUnits"
    | "TimelyFiling"
    | "COB"
    | "DemographicMismatch"
    | "MathError"
    | "EOBZeroStillBilled"
    | "NonProviderFee"
    | "ObsVsInpatient"
    | "MissingItemized"
    | "GroundAmbulance"
    | "BenefitsMath";
  severity: "info" | "warn" | "high";
  explanation: string;       // plain-English user-facing
  mathDelta?: { expected?: MoneyCents; observed?: MoneyCents };
  evidence: { lineRefs?: string[]; snippets?: string[]; pageRefs?: number[] };
  suggestedQuestions?: string[];
  policyCitations?: PolicyCitation[];
}

export interface ScriptTemplate {
  title: string; // "Billing office call — math mismatch"
  body: string;  // populated template with variables like {claimId}, {allowed}
}

export interface AppealLetter {
  title: string;
  body: string;   // full letter with placeholders
  attachments?: string[];
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

export interface Guidance {
  phoneScripts: ScriptTemplate[];
  appealLetters: AppealLetter[];
}

export interface NextAction {
  label: string;
  dueDate?: string; // ISO (e.g., appeal deadline)
}

export interface AnalyzerResult {
  documentMeta: DocumentMeta;
  lineItems: LineItem[];
  detections: Detection[];
  guidance: Guidance;
  nextActions: NextAction[];
  confidence: { overall: number; sections?: { [k: string]: number } };
  complianceFooters: string[];
  emailGate: { emailOk: boolean; message?: string; redirectUrl?: string };
  benefitsContext?: BenefitsContext;
}

// Additional types for internal processing
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