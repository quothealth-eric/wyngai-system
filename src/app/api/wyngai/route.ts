import { NextRequest, NextResponse } from 'next/server';

// WyngAI Internal Healthcare Regulation RAG Service
// Replaces OpenAI/Anthropic for healthcare-specific queries

interface WyngAIRequest {
  question: string;
  max_results?: number;
  min_score?: number;
  include_citations?: boolean;
}

interface WyngAIChunk {
  chunk_id: string;
  authority_rank: number;
  section_path: string[];
  citations: string[];
  topics: string[];
  excerpt: string;
}

interface WyngAIResponse {
  question: string;
  answer: string;
  sources: WyngAIChunk[];
  citation_text: string;
  metadata: {
    total_results: number;
    avg_authority_rank: number;
    search_performed: boolean;
    top_topics: string[];
  };
}

// Internal WyngAI Index - Pre-loaded healthcare regulation chunks
const HEALTHCARE_INDEX = [
  // Marketplace Enrollment Information
  {
    chunk_id: "marketplace_001",
    text: "Massachusetts Health Connector Open Enrollment Information\n\nMassachusetts Open Enrollment Period:\n• Annual Open Enrollment: November 1 - January 23\n• Coverage starts January 1 for enrollment by December 23\n• Coverage starts February 1 for enrollment by January 23\n\nHow to Enroll:\n1. Visit MAhealthconnector.org\n2. Create an account or log in\n3. Complete application with household information\n4. Review available plans and compare costs\n5. Select plan and submit enrollment\n6. Pay first month's premium\n\nSpecial Enrollment Periods:\n• Job loss or reduction in hours\n• Marriage, divorce, or birth/adoption\n• Loss of health coverage\n• Moving to Massachusetts\n• Becoming eligible for premium tax credits\n\nContact Information:\n• Phone: 1-877-MA-ENROLL (1-877-623-6765)\n• Website: MAhealthconnector.org\n• In-person assistance available at certified application counselors\n\nAuthority: Massachusetts Health Connector\nCitation: Massachusetts General Laws Chapter 176Q",
    authority_rank: 0.95,
    section_path: ["Massachusetts Health Connector", "Open Enrollment"],
    citations: ["Massachusetts General Laws Chapter 176Q"],
    topics: ["marketplace", "enrollment", "massachusetts", "open_enrollment"],
    keywords: ["massachusetts", "marketplace", "enrollment", "open", "enroll", "connector", "period", "coverage", "plan", "premium", "application", "website"]
  },
  {
    chunk_id: "marketplace_002",
    text: "Federal Marketplace Open Enrollment (Healthcare.gov)\n\nFederal Open Enrollment Period:\n• Annual Open Enrollment: November 1 - January 15\n• Coverage starts January 1 for enrollment by December 15\n• Coverage starts February 1 for enrollment by January 15\n\nStates Using Federal Marketplace:\n• Most states use Healthcare.gov\n• Some states have their own marketplaces\n• Special rules may apply by state\n\nHow to Enroll:\n1. Visit Healthcare.gov\n2. Create account or log in\n3. Fill out application\n4. Browse and compare plans\n5. Choose plan and enroll\n6. Pay your first premium\n\nFinancial Assistance:\n• Premium tax credits available\n• Cost-sharing reductions for eligible individuals\n• Based on household income and size\n• Advanced payments available\n\nSpecial Enrollment Triggers:\n• Qualifying life events\n• Loss of coverage\n• Changes in household size\n• Moving to new area\n\nAuthority: Centers for Medicare & Medicaid Services\nCitation: Affordable Care Act Section 1311",
    authority_rank: 0.94,
    section_path: ["Healthcare.gov", "Federal Marketplace"],
    citations: ["ACA Section 1311"],
    topics: ["marketplace", "enrollment", "federal", "open_enrollment", "healthcare"],
    keywords: ["marketplace", "enrollment", "open", "enroll", "healthcare", "federal", "period", "coverage", "plan", "premium", "tax", "credits", "assistance"]
  },
  {
    chunk_id: "expanded_reg_001",
    text: "National Coverage Determinations (NCDs) are decisions by CMS about whether Medicare will pay for an item or service.\nNCDs are binding on all Medicare contractors and are nationwide in scope.\n\nKey NCD Topics:\n\u2022 Diagnostic tests and procedures\n\u2022 Durable medical equipment\n\u2022 Prosthetics and orthotics\n\u2022 Surgical procedures\n\u2022 Preventive services\n\nNCD Appeal Process:\n1. Initial determination by CMS\n2. Reconsideration by CMS\n3. Administrative Law Judge hearing\n4. Medicare Appeals Council review\n5. Federal district court review\n\nAuthority: 42 CFR 405.860-405.874\nCitation: Social Security Act Section 1862(a)(1)(A)",
    authority_rank: 0.95,
    section_path: ["Medicare Coverage Database", "National Coverage Determinations"],
    citations: ["Section 1862", "42 CFR 405.860"],
    topics: ["appeals", "coverage_determination", "medicare"],
    keywords: ["medicare", "section", "coverage", "medical", "care", "appeal", "coverage_determination", "federal", "review", "appeals", "determination"]
  },
  {
    chunk_id: "expanded_reg_002",
    text: "Medicare Part D coverage determinations for prescription drugs include:\n\u2022 Formulary coverage decisions\n\u2022 Prior authorization requirements\n\u2022 Step therapy protocols\n\u2022 Quantity limits\n\nPart D Appeal Levels:\n1. Coverage determination by plan (72 hours standard, 24 hours expedited)\n2. Redetermination by plan (7 days standard, 72 hours expedited)\n3. Independent Review Entity (IRE) reconsideration\n4. Administrative Law Judge hearing\n5. Medicare Appeals Council review\n6. Federal district court\n\nAuthority: 42 CFR Part 423\nCitation: Medicare Prescription Drug, Improvement, and Modernization Act of 2003",
    authority_rank: 0.95,
    section_path: ["Medicare Part D Coverage Determinations"],
    citations: [],
    topics: ["appeals", "prior_authorization", "coverage_determination", "external_review", "emergency_services", "medicare"],
    keywords: ["medicare", "emergency_services", "coverage", "care", "prior", "drug", "appeal", "expedited", "formulary", "external_review", "coverage_determination", "federal", "authorization", "prescription", "review", "appeals", "prior_authorization", "determination"]
  },
  {
    chunk_id: "expanded_reg_003",
    text: "Medicare Advantage (MA) organizations must have procedures for:\n\u2022 Prior authorization decisions\n\u2022 Coverage determinations\n\u2022 Payment decisions\n\u2022 Service authorizations\n\nMA Appeal Timeline:\n\u2022 Standard coverage determination: 14 days\n\u2022 Expedited coverage determination: 72 hours\n\u2022 Standard reconsideration: 30 days\n\u2022 Expedited reconsideration: 72 hours\n\nAuthority: 42 CFR 422.566-422.618\nCitation: Social Security Act Section 1852",
    authority_rank: 0.94,
    section_path: ["Medicare Advantage Organization Determinations"],
    citations: ["Section 1852", "42 CFR 422.566"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "emergency_services", "medicare"],
    keywords: ["medicare", "section", "emergency_services", "coverage", "care", "prior", "appeal", "expedited", "timeline", "coverage_determination", "authorization", "appeals", "prior_authorization", "determination"]
  },
  {
    chunk_id: "expanded_reg_004",
    text: "California Insurance Code Section 10169 - Independent Medical Review\n\nAn enrollee may request independent medical review if:\n1. The health care service plan has denied, delayed, or modified a service based on medical necessity\n2. The plan has denied an experimental or investigational treatment\n3. The plan has denied coverage based on medical necessity for emergency services\n\nTimeline Requirements:\n\u2022 Standard review: 30 days from receipt of complete application\n\u2022 Expedited review: 3 days for urgent cases\n\u2022 Implementation: Within 5 days of favorable decision\n\nAuthority: California Insurance Code Section 10169\nCitation: Knox-Keene Health Care Service Plan Act",
    authority_rank: 0.87,
    section_path: ["California Insurance Code", "External Review"],
    citations: ["Section 10169"],
    topics: ["appeals", "coverage_determination", "emergency_services", "state_regulation"],
    keywords: ["emergency_services", "coverage", "state_regulation", "expedited", "experimental", "mental", "insurance", "medical", "coverage_determination", "urgent", "health", "review", "appeals", "section", "care", "timeline", "emergency", "investigational", "code", "necessity"]
  },
  {
    chunk_id: "expanded_reg_005",
    text: "New York Insurance Law Section 4910 - External Appeal Process\n\nExternal appeal rights apply to:\n\u2022 Adverse determinations based on medical necessity\n\u2022 Experimental or investigational treatment denials\n\u2022 Emergency service coverage denials\n\u2022 Out-of-network coverage disputes\n\nAppeal Timeline:\n\u2022 Request must be filed within 4 months of final adverse determination\n\u2022 Standard review: 30 days\n\u2022 Expedited review: 2 business days for urgent cases\n\u2022 Implementation: Immediately upon approval\n\nAuthority: New York Insurance Law Article 49\nCitation: New York Public Health Law Article 49",
    authority_rank: 0.87,
    section_path: ["New York Insurance Law", "External Appeals"],
    citations: ["Section 4910"],
    topics: ["appeals", "coverage_determination", "emergency_services", "state_regulation"],
    keywords: ["emergency_services", "coverage", "state_regulation", "expedited", "experimental", "external", "mental", "insurance", "medical", "denial", "coverage_determination", "urgent", "health", "review", "appeals", "section", "network", "appeal", "timeline", "emergency", "determination", "investigational", "dispute", "necessity"]
  },
  {
    chunk_id: "expanded_reg_006",
    text: "Texas Insurance Code Chapter 4201 - Utilization Review\n\nUtilization review requirements include:\n\u2022 Written procedures for review criteria\n\u2022 Qualified personnel conducting reviews\n\u2022 Timely determination requirements\n\u2022 Appeal procedures\n\nReview Timeframes:\n\u2022 Prospective review: 3 business days\n\u2022 Concurrent review: 1 business day\n\u2022 Retrospective review: 30 days\n\nAppeal Rights:\n\u2022 Internal appeal to health plan\n\u2022 External appeal to independent review organization\n\u2022 Complaint to Texas Department of Insurance\n\nAuthority: Texas Insurance Code Chapter 4201\nCitation: Texas Health and Safety Code Chapter 843",
    authority_rank: 0.86,
    section_path: ["Texas Insurance Code", "Utilization Review"],
    citations: [],
    topics: ["appeals", "coverage_determination", "external_review", "state_regulation"],
    keywords: ["department", "internal", "state_regulation", "appeal", "insurance", "code", "external_review", "coverage_determination", "health", "utilization", "review", "external", "appeals", "determination"]
  },
  {
    chunk_id: "expanded_reg_007",
    text: "Aetna Clinical Policy Bulletins provide coverage guidance for medical services.\n\nPrior Authorization Requirements:\n\u2022 Advanced imaging (CT, MRI, PET scans)\n\u2022 Specialty medications\n\u2022 Durable medical equipment\n\u2022 Surgical procedures\n\nAppeal Process:\n1. Peer-to-peer review with medical director\n2. Formal appeal submission with clinical documentation\n3. External review by independent medical reviewer\n4. Timeline: 30 days for standard, 72 hours for urgent\n\nCoverage Criteria Based On:\n\u2022 FDA approval status\n\u2022 Clinical evidence and guidelines\n\u2022 Medical necessity criteria\n\u2022 Safety and efficacy data\n\nAuthority: Plan documents and benefit summaries\nCitation: ERISA Section 503 appeal procedures",
    authority_rank: 0.78,
    section_path: ["Aetna Clinical Policy Bulletin", "Prior Authorization"],
    citations: ["ERISA Section 503", "Section 503"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "external_review", "emergency_services", "erisa", "payer_policy"],
    keywords: ["emergency_services", "coverage", "authorization", "external", "prior_authorization", "clinical", "medical", "external_review", "policy", "urgent", "coverage_determination", "review", "appeals", "section", "appeal", "erisa", "timeline", "prior", "necessity", "payer_policy"]
  },
  {
    chunk_id: "expanded_reg_008",
    text: "BCBS Technology Evaluation Center (TEC) assessments determine coverage for new medical technologies.\n\nTEC Criteria for Coverage:\n1. Final approval from appropriate government regulatory bodies\n2. Scientific evidence permits conclusions on safety and effectiveness\n3. Technology improves net health outcomes\n4. Technology is as beneficial as established alternatives\n5. Improvement is attainable outside investigational settings\n\nEvidence Requirements:\n\u2022 Randomized controlled trials\n\u2022 Systematic reviews and meta-analyses\n\u2022 Professional society guidelines\n\u2022 Regulatory approvals (FDA, etc.)\n\nAppeal Rights:\n\u2022 Medical director review\n\u2022 External independent review\n\u2022 State insurance department complaint process\n\nAuthority: Medical policy and coverage guidelines\nCitation: State insurance regulations and ERISA",
    authority_rank: 0.79,
    section_path: ["Blue Cross Blue Shield Technology Evaluation Center"],
    citations: [],
    topics: ["appeals", "coverage_determination", "external_review", "erisa", "state_regulation", "payer_policy"],
    keywords: ["coverage", "technology", "state_regulation", "external", "insurance", "medical", "external_review", "policy", "coverage_determination", "health", "review", "appeals", "regulation", "appeal", "state", "erisa", "investigational", "department", "payer_policy"]
  },
  {
    chunk_id: "expanded_reg_009",
    text: "UnitedHealthcare Medical Policies establish coverage criteria for medical services and technologies.\n\nCoverage Decision Factors:\n\u2022 Clinical effectiveness and safety\n\u2022 FDA approval or clearance status\n\u2022 Professional medical guidelines\n\u2022 Peer-reviewed literature\n\u2022 Cost-effectiveness analysis\n\nPrior Authorization Process:\n1. Provider submits request with clinical documentation\n2. Medical review by clinical staff\n3. Determination within 72 hours (urgent) or 15 days (non-urgent)\n4. Written notification of decision with rationale\n\nAppeal Options:\n\u2022 Peer-to-peer consultation\n\u2022 Formal written appeal with additional documentation\n\u2022 External independent medical review\n\u2022 Expedited appeal for urgent cases\n\nAuthority: Summary Plan Description and benefit documents\nCitation: ERISA fiduciary responsibilities",
    authority_rank: 0.77,
    section_path: ["UnitedHealthcare Medical Policy", "Coverage Determination"],
    citations: [],
    topics: ["appeals", "prior_authorization", "coverage_determination", "emergency_services", "erisa"],
    keywords: ["emergency_services", "coverage", "provider", "expedited", "authorization", "fiduciary", "external", "prior_authorization", "clinical", "medical", "coverage_determination", "urgent", "health", "review", "appeals", "care", "appeal", "erisa", "determination", "prior"]
  },
  {
    chunk_id: "expanded_reg_010",
    text: "ERISA Section 503 establishes minimum standards for employee benefit plan claims procedures.\n\nInitial Claims Timeline:\n\u2022 Health plans: 30 days (extendable to 45 days)\n\u2022 Disability claims: 45 days (extendable to 75 days)\n\u2022 Post-service claims: 30 days (extendable to 45 days)\n\u2022 Pre-service urgent claims: 72 hours\n\nAppeal Requirements:\n\u2022 Minimum 60 days to file appeal\n\u2022 Full and fair review of denial\n\u2022 Written decision within reasonable timeframe\n\u2022 Right to external review (for group health plans)\n\nRequired Information in Denial:\n\u2022 Specific reason(s) for denial\n\u2022 Reference to plan provisions\n\u2022 Description of additional material needed\n\u2022 Explanation of appeal procedures\n\nAuthority: 29 CFR 2560.503-1\nCitation: Employee Retirement Income Security Act Section 503",
    authority_rank: 0.98,
    section_path: ["ERISA Section 503", "Claims Procedure Regulations"],
    citations: ["ERISA Section 503", "29 CFR 2560.503", "Section 503"],
    topics: ["appeals", "external_review", "emergency_services", "erisa"],
    keywords: ["section", "emergency_services", "appeal", "claim", "erisa", "denial", "external_review", "timeline", "urgent", "health", "review", "external", "appeals"]
  },
  {
    chunk_id: "expanded_reg_011",
    text: "The Affordable Care Act requires health plans to cover Essential Health Benefits (EHBs).\n\nTen Essential Health Benefit Categories:\n1. Ambulatory patient services\n2. Emergency services\n3. Hospitalization\n4. Maternity and newborn care\n5. Mental health and substance use disorder services\n6. Prescription drugs\n7. Rehabilitative and habilitative services\n8. Laboratory services\n9. Preventive and wellness services\n10. Pediatric services\n\nCoverage Requirements:\n\u2022 No annual or lifetime benefit caps\n\u2022 Coverage of pre-existing conditions\n\u2022 Preventive services without cost-sharing\n\u2022 Mental health parity compliance\n\nAppeal Rights:\n\u2022 Internal appeal process\n\u2022 External review by independent reviewer\n\u2022 Expedited process for urgent cases\n\nAuthority: 42 USC 18022 (ACA Section 1302)\nCitation: 45 CFR Part 156 - Health Insurance Issuer Standards",
    authority_rank: 0.96,
    section_path: ["Affordable Care Act", "Essential Health Benefits"],
    citations: ["42 USC 18022", "ACA Section 1302", "Section 1302"],
    topics: ["appeals", "coverage_determination", "external_review", "emergency_services"],
    keywords: ["emergency_services", "coverage", "expedited", "external", "mental", "insurance", "substance", "benefits", "drug", "external_review", "coverage_determination", "urgent", "health", "review", "appeals", "section", "internal", "parity", "care", "appeal", "prescription", "emergency"]
  },
  {
    chunk_id: "merged_reg_012",
    text: "California Insurance Code Section 10169 - Independent Medical Review\n\nExternal Review Rights:\n\u2022 Medical necessity denials\n\u2022 Experimental/investigational treatment denials\n\u2022 Emergency service coverage disputes\n\u2022 Mental health and substance abuse treatment denials\n\nTimeline Requirements:\n\u2022 Standard review: 30 days from complete application\n\u2022 Expedited review: 3 days for urgent cases\n\u2022 Implementation: Within 5 days of favorable decision\n\u2022 No cost to enrollee for IMR process\n\nAppeal Process:\n1. Complete internal appeals process first\n2. Submit IMR application within 6 months\n3. Independent medical professional review\n4. Binding decision on health plan\n\nAuthority: California Insurance Code Section 10169\nCitation: Knox-Keene Health Care Service Plan Act",
    authority_rank: 0.89,
    section_path: ["California Insurance Code", "Independent Medical Review"],
    citations: ["Section 10169", "Code Section 10169"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "external_review", "emergency_services", "state_regulation", "mental_health"],
    keywords: ["emergency_services", "coverage", "mental_health", "state_regulation", "expedited", "experimental", "external", "mental", "prior_authorization", "insurance", "medical", "substance", "denial", "external_review", "coverage_determination", "urgent", "health", "review", "appeals", "section", "internal", "care", "appeal", "timeline", "emergency", "investigational", "code", "dispute", "necessity", "abuse"]
  },
  {
    chunk_id: "merged_reg_013",
    text: "New York Insurance Law Section 4910 - External Appeal Process\n\nCoverage of External Appeals:\n\u2022 Adverse determinations based on medical necessity\n\u2022 Experimental or investigational treatment denials\n\u2022 Emergency service coverage denials\n\u2022 Out-of-network coverage disputes\n\u2022 Prescription drug formulary disputes\n\nAppeal Timeline:\n\u2022 Request within 4 months of final adverse determination\n\u2022 Standard review: 30 days maximum\n\u2022 Expedited review: 2 business days for urgent cases\n\u2022 Implementation: Immediately upon approval\n\nExternal Review Organization Requirements:\n\u2022 Independent clinical reviewers\n\u2022 Same medical specialty as denied service\n\u2022 No conflicts of interest\n\u2022 Board-certified physicians\n\nAuthority: New York Insurance Law Article 49\nCitation: New York Public Health Law Article 49",
    authority_rank: 0.88,
    section_path: ["New York Insurance Law", "External Appeal Process"],
    citations: ["Law Section 4910", "Article 49", "Section 4910"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "external_review", "emergency_services", "state_regulation", "pharmacy", "network"],
    keywords: ["emergency_services", "coverage", "state_regulation", "pharmacy", "expedited", "experimental", "external", "mental", "prior_authorization", "insurance", "clinical", "medical", "drug", "denial", "external_review", "coverage_determination", "urgent", "health", "review", "appeals", "section", "network", "appeal", "timeline", "prescription", "emergency", "determination", "investigational", "formulary", "dispute", "necessity"]
  },
  {
    chunk_id: "merged_reg_014",
    text: "Texas Insurance Code Chapter 4201 - Utilization Review\n\nUtilization Review Requirements:\n\u2022 Written clinical review criteria\n\u2022 Qualified medical personnel conducting reviews\n\u2022 Documented decision rationale\n\u2022 Timely determination requirements\n\nReview Timeframes:\n\u2022 Prospective review: 3 business days\n\u2022 Concurrent review: 1 business day\n\u2022 Retrospective review: 30 calendar days\n\u2022 Emergency/urgent care: 1 hour\n\nAppeal Rights:\n\u2022 Internal appeal to health plan\n\u2022 External appeal to independent review organization\n\u2022 Complaint to Texas Department of Insurance\n\u2022 Right to continued coverage during appeals\n\nAuthority: Texas Insurance Code Chapter 4201\nCitation: Texas Health and Safety Code Chapter 843",
    authority_rank: 0.87,
    section_path: ["Texas Insurance Code", "Utilization Review Process"],
    citations: ["Chapter 843", "Chapter 4201"],
    topics: ["appeals", "coverage_determination", "external_review", "emergency_services", "state_regulation"],
    keywords: ["emergency_services", "coverage", "state_regulation", "utilization", "external", "insurance", "clinical", "medical", "external_review", "coverage_determination", "urgent", "health", "review", "appeals", "internal", "care", "appeal", "emergency", "determination", "department", "code"]
  },
  {
    chunk_id: "merged_reg_015",
    text: "Florida Statutes Chapter 641 - Health Care Services Review\n\nExternal Review Process:\n\u2022 Available for medical necessity denials\n\u2022 Experimental treatment coverage disputes\n\u2022 Emergency service authorization denials\n\u2022 Mental health and substance abuse coverage\n\nTimeline Requirements:\n\u2022 External review request within 60 days\n\u2022 Standard review: 45 days maximum\n\u2022 Expedited review: 72 hours for urgent cases\n\u2022 Implementation within 5 business days\n\nIndependent Review Organization:\n\u2022 Accredited by recognized accrediting organization\n\u2022 Clinical peers in same specialty\n\u2022 No financial relationship with health plan\n\u2022 Written decision with clinical rationale\n\nAuthority: Florida Statutes Chapter 641\nCitation: Florida Health Care Responsibility Act",
    authority_rank: 0.86,
    section_path: ["Florida Insurance Code", "Health Care Services Review"],
    citations: ["Chapter 641"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "external_review", "emergency_services", "mental_health"],
    keywords: ["emergency_services", "coverage", "mental_health", "expedited", "experimental", "authorization", "external", "mental", "prior_authorization", "clinical", "medical", "substance", "denial", "external_review", "coverage_determination", "urgent", "health", "review", "appeals", "care", "timeline", "emergency", "dispute", "necessity", "abuse"]
  },
  {
    chunk_id: "merged_reg_016",
    text: "Illinois Insurance Code - External Review Process\n\nScope of External Review:\n\u2022 Medical necessity determinations\n\u2022 Experimental/investigational treatment\n\u2022 Emergency care coverage disputes\n\u2022 Prescription drug coverage denials\n\nReview Timeline:\n\u2022 Application within 60 days of final internal decision\n\u2022 Standard external review: 45 days\n\u2022 Expedited review: 72 hours for urgent care\n\u2022 Immediate implementation if approved\n\nReviewer Qualifications:\n\u2022 Board certification in relevant specialty\n\u2022 No material financial relationship with plan\n\u2022 Clinical experience in disputed treatment\n\u2022 Licensed to practice in United States\n\nAuthority: Illinois Insurance Code Section 370c\nCitation: Illinois Health Carrier External Review Act",
    authority_rank: 0.85,
    section_path: ["Illinois Insurance Code", "External Review"],
    citations: ["Code Section 370", "Section 370"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "external_review", "emergency_services", "state_regulation", "pharmacy"],
    keywords: ["emergency_services", "coverage", "state_regulation", "pharmacy", "expedited", "experimental", "external", "mental", "prior_authorization", "insurance", "clinical", "medical", "drug", "denial", "external_review", "coverage_determination", "urgent", "health", "review", "appeals", "section", "internal", "care", "state", "timeline", "prescription", "emergency", "determination", "investigational", "code", "dispute", "necessity"]
  },
  {
    chunk_id: "merged_reg_017",
    text: "Pennsylvania External Review Process\n\nAvailable for:\n\u2022 Medical necessity denials\n\u2022 Experimental treatment disputes\n\u2022 Emergency service coverage\n\u2022 Out-of-network provider coverage\n\nTimeline: 60 days to request, 45 days for decision\nExpedited: 72 hours for urgent cases\nAuthority: Pennsylvania Insurance Code Title 40",
    authority_rank: 0.84,
    section_path: ["Pennsylvania Insurance Code", "External Review"],
    citations: ["Title 40"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "external_review", "emergency_services", "state_regulation", "network"],
    keywords: ["emergency_services", "coverage", "provider", "state_regulation", "expedited", "experimental", "external", "mental", "prior_authorization", "insurance", "medical", "denial", "external_review", "coverage_determination", "urgent", "review", "appeals", "network", "timeline", "emergency", "code", "dispute", "necessity"]
  },
  {
    chunk_id: "merged_reg_018",
    text: "Michigan External Appeal Rights\n\nCoverage includes:\n\u2022 Medical necessity determinations\n\u2022 Experimental treatment denials\n\u2022 Emergency care authorization\n\u2022 Prescription drug coverage disputes\n\nTimeline: 180 days to request, 60 days for decision\nExpedited: 72 hours for urgent medical situations\nAuthority: Michigan Insurance Code Section 500.3406s",
    authority_rank: 0.83,
    section_path: ["Michigan Insurance Code", "External Appeal Process"],
    citations: ["Code Section 500", "Section 500.3406"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "emergency_services", "state_regulation", "pharmacy"],
    keywords: ["emergency_services", "coverage", "state_regulation", "pharmacy", "expedited", "experimental", "authorization", "external", "mental", "prior_authorization", "insurance", "medical", "drug", "denial", "coverage_determination", "urgent", "appeals", "section", "care", "appeal", "timeline", "prescription", "emergency", "determination", "code", "dispute", "necessity"]
  },
  {
    chunk_id: "merged_reg_019",
    text: "Ohio External Review System\n\nApplies to:\n\u2022 Adverse benefit determinations\n\u2022 Medical necessity disputes\n\u2022 Experimental/investigational treatment\n\u2022 Emergency service coverage\n\nProcess: 180 days to request, 45 days for review\nExpedited: 72 hours for urgent cases\nAuthority: Ohio Revised Code Section 3901.80",
    authority_rank: 0.82,
    section_path: ["Ohio Insurance Code", "External Review Process"],
    citations: ["Code Section 3901", "Section 3901.80"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "external_review", "emergency_services"],
    keywords: ["emergency_services", "coverage", "expedited", "experimental", "external", "mental", "prior_authorization", "medical", "external_review", "coverage_determination", "urgent", "review", "appeals", "section", "emergency", "determination", "investigational", "code", "dispute", "necessity"]
  },
  {
    chunk_id: "merged_reg_020",
    text: "North Carolina External Review Process\n\nAvailable for:\n\u2022 Medical necessity denials by health plans\n\u2022 Experimental/investigational treatment disputes\n\u2022 Emergency service coverage denials\n\u2022 Prescription drug formulary appeals\n\nTimeline: 180 days to file, 60 days for decision\nExpedited: 72 hours for urgent medical needs\nAuthority: North Carolina General Statutes Section 58-50-80",
    authority_rank: 0.81,
    section_path: ["North Carolina Insurance Code", "External Review"],
    citations: ["Statutes Section 58", "Section 58"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "external_review", "emergency_services", "pharmacy"],
    keywords: ["emergency_services", "coverage", "pharmacy", "expedited", "experimental", "external", "mental", "prior_authorization", "medical", "drug", "denial", "external_review", "coverage_determination", "urgent", "health", "review", "appeals", "section", "appeal", "timeline", "prescription", "emergency", "investigational", "formulary", "dispute", "necessity"]
  },
  {
    chunk_id: "merged_reg_021",
    text: "Georgia External Appeal Rights\n\nScope includes:\n\u2022 Health plan medical necessity denials\n\u2022 Experimental treatment coverage disputes\n\u2022 Emergency care authorization denials\n\u2022 Mental health and substance abuse coverage\n\nProcess: 60 days to request, 60 days for review\nExpedited: 72 hours for time-sensitive cases\nAuthority: Georgia Code Section 33-20A-36",
    authority_rank: 0.8,
    section_path: ["Georgia Insurance Code", "External Appeals"],
    citations: ["Section 33", "Code Section 33"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "emergency_services", "mental_health"],
    keywords: ["emergency_services", "coverage", "mental_health", "expedited", "experimental", "authorization", "external", "mental", "prior_authorization", "medical", "substance", "denial", "coverage_determination", "health", "review", "appeals", "section", "care", "appeal", "emergency", "code", "dispute", "necessity", "abuse"]
  },
  {
    chunk_id: "merged_reg_022",
    text: "Anthem Blue Cross Blue Shield Medical Policy Process\n\nCoverage Determination Criteria:\n\u2022 FDA approval or clearance status\n\u2022 Peer-reviewed published literature\n\u2022 Professional society guidelines\n\u2022 Clinical effectiveness and safety\n\u2022 Cost-effectiveness considerations\n\nPrior Authorization Requirements:\n\u2022 Advanced diagnostic imaging\n\u2022 Specialty pharmaceuticals\n\u2022 Experimental/investigational procedures\n\u2022 High-cost medical devices\n\u2022 Genetic testing\n\nAppeal Process:\n1. Peer-to-peer consultation available\n2. Formal written appeal with clinical documentation\n3. Independent external medical review\n4. Expedited process for urgent cases\n\nTimeline:\n\u2022 Standard determination: 15 calendar days\n\u2022 Urgent determination: 72 hours\n\u2022 Appeal decision: 30 calendar days\n\u2022 Expedited appeal: 72 hours\n\nAuthority: Medical policy and coverage guidelines\nCitation: ERISA fiduciary responsibilities and state regulations",
    authority_rank: 0.82,
    section_path: ["Anthem/BCBS Medical Policy", "Coverage Determination Process"],
    citations: [],
    topics: ["appeals", "prior_authorization", "coverage_determination", "emergency_services", "erisa", "state_regulation", "payer_policy"],
    keywords: ["emergency_services", "coverage", "state_regulation", "expedited", "experimental", "authorization", "fiduciary", "external", "mental", "prior_authorization", "clinical", "medical", "policy", "coverage_determination", "urgent", "review", "appeals", "regulation", "appeal", "state", "erisa", "timeline", "determination", "investigational", "prior", "payer_policy"]
  },
  {
    chunk_id: "merged_reg_023",
    text: "Cigna Medical Coverage Policy Framework\n\nEvidence-Based Coverage Decisions:\n\u2022 Randomized controlled trials\n\u2022 Systematic reviews and meta-analyses\n\u2022 Professional medical guidelines\n\u2022 FDA regulatory status\n\u2022 Safety and efficacy data\n\nCoverage Categories:\n\u2022 Medically necessary and appropriate\n\u2022 Experimental/investigational\n\u2022 Cosmetic or not medically necessary\n\u2022 Unproven or not covered\n\nPrior Authorization Process:\n\u2022 Clinical documentation requirements\n\u2022 Medical director review\n\u2022 Specialist consultation if needed\n\u2022 External expert review for complex cases\n\nAppeal Rights:\n\u2022 Internal medical director review\n\u2022 External independent medical review\n\u2022 Expedited process for urgent situations\n\u2022 Member grievance process\n\nAuthority: Plan documents and benefit summaries\nCitation: Clinical practice guidelines and regulatory requirements",
    authority_rank: 0.81,
    section_path: ["Cigna Medical Coverage Policy", "Clinical Guidelines"],
    citations: [],
    topics: ["appeals", "prior_authorization", "coverage_determination", "external_review", "emergency_services", "payer_policy"],
    keywords: ["emergency_services", "coverage", "expedited", "experimental", "authorization", "external", "mental", "prior_authorization", "clinical", "medical", "external_review", "policy", "coverage_determination", "urgent", "review", "appeals", "internal", "appeal", "investigational", "grievance", "prior", "payer_policy"]
  },
  {
    chunk_id: "merged_reg_024",
    text: "Humana Medical Policy and Appeals Process\n\nCoverage Determination Standards:\n\u2022 Clinical evidence from peer-reviewed literature\n\u2022 Professional medical society recommendations\n\u2022 FDA approval status and indications\n\u2022 Safety profiles and clinical outcomes\n\u2022 Comparative effectiveness research\n\nPrior Authorization Categories:\n\u2022 High-cost specialty medications\n\u2022 Advanced imaging procedures\n\u2022 Surgical procedures\n\u2022 Durable medical equipment\n\u2022 Home health services\n\nAppeals Process:\n1. Standard appeal with additional clinical information\n2. Expedited appeal for urgent medical situations\n3. External independent medical review\n4. Administrative review for procedural issues\n\nTimeline Requirements:\n\u2022 Prior authorization: 72 hours urgent, 15 days standard\n\u2022 Appeal decision: 72 hours urgent, 30 days standard\n\u2022 External review: 45 days standard, 72 hours urgent\n\nAuthority: Summary of Benefits and Coverage documents\nCitation: ERISA Section 503 and applicable state laws",
    authority_rank: 0.8,
    section_path: ["Humana Medical Policy", "Coverage and Appeals"],
    citations: ["ERISA Section 503", "Section 503"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "external_review", "emergency_services", "erisa", "state_regulation", "payer_policy", "pharmacy"],
    keywords: ["emergency_services", "coverage", "state_regulation", "pharmacy", "expedited", "authorization", "external", "prior_authorization", "clinical", "medical", "benefits", "external_review", "policy", "coverage_determination", "urgent", "health", "review", "appeals", "section", "appeal", "state", "erisa", "timeline", "determination", "prior", "payer_policy"]
  },
  {
    chunk_id: "merged_reg_025",
    text: "Kaiser Permanente Medical Policy Framework\n\nIntegrated Coverage Model:\n\u2022 Evidence-based clinical guidelines\n\u2022 Interregional Medical Group consensus\n\u2022 Technology assessment committee review\n\u2022 Cost-effectiveness analysis\n\u2022 Population health outcomes\n\nCoverage Determination Process:\n\u2022 Clinical necessity review\n\u2022 Physician medical director consultation\n\u2022 Regional medical group approval\n\u2022 External expert consultation when needed\n\nMember Appeal Rights:\n\u2022 Informal review with medical director\n\u2022 Formal grievance process\n\u2022 Independent medical review (state-mandated)\n\u2022 Department of Managed Health Care complaint\n\nSpecial Considerations:\n\u2022 Integrated delivery model\n\u2022 Regional variation in policies\n\u2022 Clinical trial coverage policies\n\u2022 Experimental treatment protocols\n\nAuthority: Member Agreement and Evidence of Coverage\nCitation: California Knox-Keene Act and federal regulations",
    authority_rank: 0.79,
    section_path: ["Kaiser Permanente Medical Policy", "Integrated Care Model"],
    citations: [],
    topics: ["appeals", "coverage_determination", "external_review", "state_regulation", "payer_policy", "federal_regulation"],
    keywords: ["coverage", "technology", "state_regulation", "experimental", "external", "mental", "clinical", "medical", "external_review", "policy", "coverage_determination", "health", "review", "appeals", "federal_regulation", "regulation", "care", "appeal", "state", "determination", "department", "grievance", "necessity", "federal", "payer_policy", "managed"]
  },
  {
    chunk_id: "merged_reg_026",
    text: "ERISA Fiduciary Standards for Benefit Plan Administration\n\nFiduciary Duties Under ERISA:\n\u2022 Act solely in interest of participants and beneficiaries\n\u2022 Act for exclusive purpose of providing benefits\n\u2022 Act with care, skill, prudence, and diligence\n\u2022 Follow plan documents unless inconsistent with ERISA\n\u2022 Diversify plan investments to minimize risk\n\nClaims and Appeals Process:\n\u2022 Full and fair review of claim denials\n\u2022 Reasonable procedures for appeals\n\u2022 Adequate notice of adverse decisions\n\u2022 Access to relevant plan documents\n\u2022 Right to submit written comments and documents\n\nRequired Information in Denial Notice:\n\u2022 Specific reason(s) for adverse determination\n\u2022 Reference to specific plan provisions\n\u2022 Description of additional material needed\n\u2022 Explanation of plan's appeal procedures\n\u2022 Statement of right to external review\n\nTimeline Requirements:\n\u2022 Initial claim decision: 30 days (health), 45 days (disability)\n\u2022 Appeal decision: 60 days (health), 45 days (disability)\n\u2022 Urgent care claims: 72",
    authority_rank: 0.97,
    section_path: ["ERISA Fiduciary Standards", "Plan Administration"],
    citations: ["ERISA Section 404", "29 CFR 2560.503", "Section 404"],
    topics: ["appeals", "coverage_determination", "external_review", "emergency_services", "erisa", "state_regulation"],
    keywords: ["emergency_services", "state_regulation", "fiduciary", "external", "benefits", "claim", "denial", "external_review", "coverage_determination", "urgent", "health", "review", "appeals", "regulation", "section", "care", "appeal", "state", "erisa", "timeline", "determination"]
  },
  {
    chunk_id: "merged_reg_027",
    text: "Mental Health Parity and Addiction Equity Act (MHPAEA)\n\nParity Requirements:\n\u2022 Financial requirements cannot be more restrictive for mental health/substance use disorder (MH/SUD) benefits\n\u2022 Treatment limitations cannot be more restrictive for MH/SUD benefits\n\u2022 Medical management techniques must be comparable\n\u2022 Provider network access must be equivalent\n\nCoverage Areas:\n\u2022 Inpatient mental health and substance use disorder treatment\n\u2022 Outpatient mental health and substance use disorder treatment\n\u2022 Emergency mental health and substance use disorder services\n\u2022 Prescription drugs for mental health and substance use disorders\n\nNon-Quantitative Treatment Limitations:\n\u2022 Prior authorization requirements\n\u2022 Fail-first or step therapy protocols\n\u2022 Standards for provider admission to networks\n\u2022 Plan methods for determining usual, customary, and reasonable charges\n\u2022 Restrictions based on geographic location, facility type, provider specialty\n\nCompliance Requirements:\n\u2022 Comparative analysis of design ",
    authority_rank: 0.95,
    section_path: ["Mental Health Parity and Addiction Equity Act", "Coverage Requirements"],
    citations: ["29 CFR 2590.712", "MHPAEA Section 712", "Section 712"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "emergency_services", "erisa", "mental_health", "pharmacy", "network"],
    keywords: ["emergency_services", "coverage", "mental_health", "provider", "pharmacy", "authorization", "mental", "prior_authorization", "medical", "facility", "substance", "benefits", "drug", "coverage_determination", "health", "review", "appeals", "section", "network", "parity", "erisa", "prescription", "emergency", "prior"]
  },
  {
    chunk_id: "merged_reg_028",
    text: "No Surprises Act - Emergency Services and Out-of-Network Billing\n\nEmergency Services Coverage:\n\u2022 No prior authorization required for emergency services\n\u2022 Coverage at in-network cost-sharing levels\n\u2022 Independent dispute resolution for payment disputes\n\u2022 Good faith estimate requirements for uninsured patients\n\nOut-of-Network Coverage Protections:\n\u2022 Applies to emergency services at any facility\n\u2022 Non-emergency services at in-network facilities from out-of-network providers\n\u2022 Air ambulance services\n\u2022 Protected against balance billing\n\nIndependent Dispute Resolution (IDR):\n\u2022 Available for out-of-network payment disputes over $400\n\u2022 Both parties submit payment offers\n\u2022 Arbitrator selects one offer (baseball-style arbitration)\n\u2022 Decision is binding on both parties\n\nPatient Protections:\n\u2022 Advance notice of out-of-network providers\n\u2022 Consent requirements for non-emergency out-of-network care\n\u2022 Good faith estimates for uninsured/self-pay patients\n\u2022 Patient-provider dispute resolution process\n\nEf",
    authority_rank: 0.94,
    section_path: ["No Surprises Act", "Emergency Services and Billing"],
    citations: ["45 CFR Part 149"],
    topics: ["appeals", "prior_authorization", "coverage_determination", "emergency_services", "network", "billing"],
    keywords: ["network", "emergency_services", "coverage", "billing", "facility", "balance", "prior", "care", "provider", "dispute", "coverage_determination", "surprise", "authorization", "appeals", "prior_authorization", "emergency"]
  }
];;;

// Healthcare-focused search function
function searchChunks(query: string, maxResults: number = 5): WyngAIChunk[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);

  // Healthcare context keywords that must be present for a valid match
  const healthcareContextWords = [
    'appeal', 'claim', 'coverage', 'insurance', 'medical', 'health', 'benefit',
    'erisa', 'medicare', 'medicaid', 'plan', 'policy', 'authorization', 'review',
    'determination', 'denial', 'treatment', 'care', 'hospital', 'doctor',
    'prescription', 'drug', 'formulary', 'network', 'provider', 'facility',
    'emergency', 'urgent', 'external', 'internal', 'payer', 'regulation',
    'law', 'code', 'section', 'federal', 'state', 'marketplace', 'enrollment',
    'enroll', 'open', 'connector', 'premium', 'deductible', 'copay'
  ];

  // Check if query has healthcare context
  const hasHealthcareContext = queryWords.some(word =>
    healthcareContextWords.some(hcWord =>
      word.includes(hcWord) || hcWord.includes(word)
    )
  );

  // If no healthcare context, return empty results
  if (!hasHealthcareContext) {
    console.log('🔥 WyngAI: No healthcare context detected in query');
    return [];
  }

  // Score chunks based on keyword matches
  const scoredChunks = HEALTHCARE_INDEX.map(chunk => {
    let score = 0;
    let exactMatches = 0;

    // Check keywords array - require exact or very close matches
    chunk.keywords.forEach(keyword => {
      queryWords.forEach(word => {
        if (keyword === word) {
          score += chunk.authority_rank * 2; // Exact match bonus
          exactMatches++;
        } else if (keyword.includes(word) || word.includes(keyword)) {
          score += chunk.authority_rank * 0.8; // Partial match
        }
      });
    });

    // Check text content - be more selective
    queryWords.forEach(word => {
      if (word.length >= 4 && chunk.text.toLowerCase().includes(word)) {
        score += chunk.authority_rank * 0.3;
      }
    });

    // Check topics - require close matches, prioritize exact matches
    chunk.topics.forEach(topic => {
      queryWords.forEach(word => {
        if (topic === word) {
          score += chunk.authority_rank * 3.0; // Exact topic match gets highest priority
          exactMatches++;
        } else if (topic.includes(word) || word.includes(topic)) {
          score += chunk.authority_rank * 0.8;
        }
      });
    });

    // Require minimum score threshold
    if (score < 0.1) {
      score = 0;
    }

    return {
      ...chunk,
      score,
      exactMatches,
      excerpt: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : '')
    };
  });

  // Sort by score and exact matches, return top results
  return scoredChunks
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => {
      // Prioritize exact matches first, then score
      if (a.exactMatches !== b.exactMatches) {
        return b.exactMatches - a.exactMatches;
      }
      return b.score - a.score;
    })
    .slice(0, maxResults)
    .map(chunk => ({
      chunk_id: chunk.chunk_id,
      authority_rank: chunk.authority_rank,
      section_path: chunk.section_path,
      citations: chunk.citations,
      topics: chunk.topics,
      excerpt: chunk.excerpt
    }));
}

// Generate answer based on search results
function generateAnswer(question: string, sources: WyngAIChunk[]): string {
  if (sources.length === 0) {
    return "I don't have specific information about that healthcare topic in my current knowledge base. For marketplace enrollment questions, visit Healthcare.gov or your state's marketplace website. For appeals and coverage issues, contact your insurance company directly.";
  }

  const topSource = sources[0];
  const additionalSources = sources.slice(1, 2);

  // Check if this is a marketplace/enrollment question
  const isMarketplaceQuestion = topSource.topics.some(topic =>
    ['marketplace', 'enrollment', 'open_enrollment'].includes(topic)
  );

  let answer = "";

  if (isMarketplaceQuestion) {
    answer = "Here's what I found about marketplace enrollment:\n\n";
    answer += `${topSource.excerpt}\n\n`;

    if (additionalSources.length > 0) {
      answer += "**Additional Information:**\n";
      additionalSources.forEach(source => {
        answer += `${source.excerpt.substring(0, 200)}${source.excerpt.length > 200 ? '...' : ''}\n\n`;
      });
    }

    answer += "**Note:** Enrollment periods and requirements may change. Always verify current information on the official marketplace website.";
  } else {
    // Regulatory/appeals content
    answer = "Based on healthcare regulations and policies, here's what I found:\n\n";
    answer += `**Primary Source (${topSource.authority_rank.toFixed(2)} authority):** ${topSource.section_path.join(' -> ')}\n\n`;
    answer += `${topSource.excerpt}\n\n`;

    if (additionalSources.length > 0) {
      answer += "**Additional Context:**\n\n";
      additionalSources.forEach(source => {
        answer += `${source.section_path.join(' -> ')}\n${source.excerpt.substring(0, 150)}${source.excerpt.length > 150 ? '...' : ''}\n\n`;
      });
    }

    answer += "**Important:** This information is provided for reference only. Always consult official sources and qualified professionals for specific cases.";
  }

  return answer;
}

// Format citations
function formatCitations(sources: WyngAIChunk[]): string {
  return sources.map((source, index) => {
    const citationParts = [
      ...source.citations,
      source.section_path.join(' -> ')
    ].filter(part => part);

    return `[${index + 1}] ${citationParts.join('; ')}`;
  }).join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const body: WyngAIRequest = await request.json();

    console.log('🔥 WyngAI API: Received request for question:', body.question);

    if (!body.question || typeof body.question !== 'string') {
      return NextResponse.json(
        { error: 'Question is required and must be a string' },
        { status: 400 }
      );
    }

    const maxResults = Math.min(body.max_results || 5, 10);

    // Search for relevant chunks
    const sources = searchChunks(body.question, maxResults);

    // Generate answer
    const answer = generateAnswer(body.question, sources);

    // Generate citations
    const citationText = body.include_citations !== false ? formatCitations(sources) : '';

    // Calculate metadata
    const avgAuthorityRank = sources.length > 0
      ? sources.reduce((sum, source) => sum + source.authority_rank, 0) / sources.length
      : 0;

    const topTopics = Array.from(new Set(
      sources.flatMap(source => source.topics)
    )).slice(0, 5);

    const response: WyngAIResponse = {
      question: body.question,
      answer,
      sources,
      citation_text: citationText,
      metadata: {
        total_results: sources.length,
        avg_authority_rank: avgAuthorityRank,
        search_performed: true,
        top_topics: topTopics
      }
    };

    console.log(`🔥 WyngAI API: Successfully responded with ${sources.length} sources, avg authority: ${(avgAuthorityRank * 100).toFixed(0)}%`);

    return NextResponse.json(response);

  } catch (error) {
    console.error('🔥 WyngAI API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'WyngAI Internal Healthcare RAG',
    version: '1.0.0',
    index_stats: {
      status: 'ready',
      total_chunks: HEALTHCARE_INDEX.length,
      avg_authority_rank: HEALTHCARE_INDEX.reduce((sum, chunk) => sum + chunk.authority_rank, 0) / HEALTHCARE_INDEX.length,
      topics_covered: ['ERISA', 'Medicare', 'ACA', 'Appeals', 'Coverage']
    }
  });
}