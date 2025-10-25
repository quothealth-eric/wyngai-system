/**
 * WyngAI Central Assistant - RAG Types & Interfaces
 * Comprehensive type definitions for the RAG system
 */

// Document and Section Types
export interface DocumentMetadata {
  doc_id: string;
  authority: 'federal' | 'cms' | 'state_doi' | 'payer' | 'marketplace' | 'transparency';
  jurisdiction?: string; // state code or payer name
  payer?: string;
  title: string;
  doc_type: 'regulation' | 'manual' | 'policy' | 'ncd' | 'lcd' | 'faq' | 'form' | 'transparency';
  eff_date?: string;
  version?: string;
  url: string;
  url_hash: string;
  sha256: string;
  storage_path?: string;
  retrieved_at: string;
}

export interface DocumentSection {
  section_id: string;
  doc_id: string;
  section_path?: string;
  title?: string;
  text: string;
  tokens: number;
  eff_date?: string;
  version?: string;
  embedding?: number[];
  created_at: string;
}

// Chat Session Types
export interface ChatSession {
  chat_id: string;
  case_id?: string;
  user_id?: string;
  session_type: 'insurance_assistant' | 'bill_analysis' | 'plan_comparison';
  context_data: ChatContext;
  started_at: string;
  last_activity_at: string;
  status: 'active' | 'completed' | 'abandoned';
}

export interface ChatContext {
  planInputs?: InsurancePlanInputs;
  userState?: string;
  lastAnswer?: ChatResponse;
  collectedFacts?: Record<string, any>;
  clarificationHistory?: string[];
}

export interface InsurancePlanInputs {
  planType?: 'HMO' | 'PPO' | 'EPO' | 'HDHP' | 'POS';
  state?: string;
  isMarketplace?: boolean;
  planName?: string;
  deductible?: {
    individual: number;
    family: number;
    met_amount?: number;
  };
  oop_max?: {
    individual: number;
    family: number;
    met_amount?: number;
  };
  coinsurance?: number;
  copays?: {
    primary_care?: number;
    specialist?: number;
    er?: number;
    urgent_care?: number;
  };
  network?: {
    in_network_deductible?: number;
    out_of_network_deductible?: number;
    in_network_coinsurance?: number;
    out_of_network_coinsurance?: number;
  };
}

export interface ChatMessage {
  message_id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_type: 'text' | 'file_upload' | 'clarification' | 'answer';
  metadata?: ChatMessageMetadata;
  files?: UploadedFile[];
  created_at: string;
}

export interface ChatMessageMetadata {
  citations?: Citation[];
  nextSteps?: string[];
  scripts?: Script[];
  forms?: Form[];
  calc?: Calculation;
  clarification_intent?: string;
  entities?: ExtractedEntities;
}

// Response Types
export interface ChatResponse {
  answer: string;
  citations: Citation[];
  nextSteps: string[];
  scripts: Script[];
  forms: Form[];
  calc?: Calculation;
  clarification?: {
    question: string;
    intent: string;
    options?: string[];
  };
  confidence: number;
  authorities_used: string[];
  jargonExplanations?: JargonDefinition[];
  actionableLinks?: ActionableLink[];
}

export interface JargonDefinition {
  term: string;
  definition: string;
  example?: string;
}

export interface ActionableLink {
  text: string;
  url: string;
  description: string;
}

export interface Citation {
  authority: string;
  title: string;
  section_or_policy_id?: string;
  eff_date?: string;
  url?: string;
  excerpt?: string;
}

export interface Script {
  channel: 'payer' | 'provider' | 'employer' | 'state_doi' | 'marketplace';
  purpose: string;
  body: string;
  estimated_duration?: string;
}

export interface Form {
  name: string;
  url?: string;
  description?: string;
  required_info?: string[];
}

export interface Calculation {
  type: 'patient_share' | 'oop_progress' | 'deductible_progress' | 'premium_comparison';
  inputs: Record<string, any>;
  result: Record<string, any>;
  explanation: string;
  assumptions?: string[];
}

// Query and Retrieval Types
export interface RAGQuery {
  text: string;
  entities: ExtractedEntities;
  context: ChatContext;
  chat_id?: string;
  max_chunks_per_authority?: number;
}

export interface ExtractedEntities {
  planType?: string;
  state?: string;
  provider?: string;
  npi?: string;
  cpt_codes?: string[];
  hcpcs_codes?: string[];
  date_of_service?: string;
  network_status?: 'in' | 'out' | 'unknown';
  keywords?: string[];
  intent?: string;
  urgency?: 'low' | 'medium' | 'high';
}

export interface RetrievalResult {
  sections: ScoredSection[];
  authorities_used: string[];
  query_embedding?: number[];
  total_results: number;
}

export interface ScoredSection {
  section: DocumentSection;
  document: DocumentMetadata;
  score: number;
  match_type: 'semantic' | 'keyword' | 'hybrid';
  highlighted_text?: string;
}

// Data Source Connector Types
export interface DataSourceConnector {
  source_id: string;
  authority: string;
  jurisdiction?: string;
  payer?: string;
  fetch_index(): Promise<DiscoveredDocument[]>;
  fetch_doc(url: string): Promise<ProcessedDocument>;
  split_to_sections(doc: ProcessedDocument): Promise<DocumentSection[]>;
}

export interface DiscoveredDocument {
  url: string;
  title: string;
  doc_type: string;
  eff_date?: string;
  version?: string;
  last_modified?: string;
  content_hash?: string;
}

export interface ProcessedDocument {
  url: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  doc_type: string;
  eff_date?: string;
  version?: string;
  sha256: string;
}

// File Upload and OCR Types
export interface UploadedFile {
  file_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  upload_type: 'eob' | 'bill' | 'id_card' | 'letter' | 'form' | 'other';
  ocr_results?: OCRResult[];
  extracted_data?: ExtractedInsuranceData;
}

export interface OCRResult {
  provider: 'openai_vision' | 'google_vision' | 'tesseract';
  confidence: number;
  text: string;
  structured_data?: Record<string, any>;
  processing_time_ms: number;
  error?: string;
}

export interface ExtractedInsuranceData {
  plan_info?: {
    plan_name?: string;
    member_id?: string;
    group_number?: string;
    plan_type?: string;
    effective_date?: string;
  };
  claims_info?: {
    claim_number?: string;
    date_of_service?: string;
    provider_name?: string;
    provider_npi?: string;
    diagnosis_codes?: string[];
    procedure_codes?: string[];
    carc_codes?: string[];
    rarc_codes?: string[];
  };
  financial_info?: {
    total_charges?: number;
    allowed_amount?: number;
    plan_paid?: number;
    patient_responsibility?: number;
    deductible_applied?: number;
    coinsurance_applied?: number;
    copay_applied?: number;
  };
}

// Crawl and Update Types
export interface CrawlStatus {
  source_id: string;
  last_crawl_at?: string;
  last_success_at?: string;
  last_error?: string;
  documents_count: number;
  sections_count: number;
  next_scheduled_at?: string;
  crawl_frequency: string; // interval
  status: 'pending' | 'running' | 'completed' | 'error';
  metadata?: Record<string, any>;
}

export interface ChangeLogEntry {
  change_id: string;
  authority: string;
  jurisdiction?: string;
  change_type: 'new_doc' | 'updated_doc' | 'deleted_doc' | 'reindex';
  description: string;
  doc_count: number;
  section_count: number;
  created_at: string;
}

// Tool and Calculator Types
export interface PlanMathInputs {
  allowed_amount: number;
  deductible_total: number;
  deductible_met_at_dos: number;
  coinsurance: number;
  oop_total: number;
  oop_met_at_dos: number;
  copay?: number;
  out_of_network?: boolean;
}

export interface PlanMathResult {
  patient_share: number;
  plan_pays: number;
  deductible_applied: number;
  coinsurance_applied: number;
  copay_applied: number;
  remaining_deductible: number;
  remaining_oop: number;
  explanation: string;
}

export interface NSAScenario {
  service_type: 'emergency' | 'ancillary' | 'non_emergency';
  facility_type: 'hospital' | 'asc' | 'office' | 'other';
  provider_type: 'facility' | 'professional';
  state: string;
  notice_given?: boolean;
  consent_given?: boolean;
}

export interface NSAResult {
  protected: boolean;
  explanation: string;
  next_steps: string[];
  state_doi_link?: string;
  forms?: Form[];
}