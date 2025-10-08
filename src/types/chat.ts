import { DocumentArtifact, PricedSummary, Detection } from './analyzer';
import { PolicyCitation } from './common';

export interface BenefitsContext {
  planType?: "HMO" | "PPO" | "EPO" | "POS" | "HDHP" | "Other";
  network?: "IN" | "OUT" | "Unknown";
  secondaryCoverage?: boolean;
}

export interface UnifiedChatCase {
  caseId: string;
  artifacts: DocumentArtifact[];
  narrative: { text: string; themeHints?: string[] };
  benefits?: BenefitsContext;
}

export interface ScriptTemplate {
  title: string;
  body: string;
}

export interface AppealLetter {
  title: string;
  body: string;
}

export interface ChatAnswer {
  caseId: string;
  pricedSummary?: PricedSummary;
  keyFacts?: string[];
  detections?: Detection[];
  answer: string;
  checklist: string[];
  phoneScripts: ScriptTemplate[];
  appealLetters: AppealLetter[];
  sources: PolicyCitation[];
  confidence: { overall: number; ocr?: number; retrieval?: number };
}