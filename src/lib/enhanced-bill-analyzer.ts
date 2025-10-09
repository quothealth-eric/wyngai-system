import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// Enhanced Bill Analyzer Types
export interface BillHeader {
  facility: string | null;
  patientName: string | null;
  patientRef: string | null;
  serviceDateStart: string | null; // YYYY-MM-DD
  serviceDateEnd: string | null;   // YYYY-MM-DD
  mrn: string | null;
  accountNumber: string | null;
  pageInfo: string | null;
}

export interface BillLineItem {
  page: number | null;
  dos: string | null; // Date of Service YYYY-MM-DD
  code: string;
  codeSystem: "CPT" | "HCPCS" | "REV" | "NDC" | "UBR" | "UNKNOWN";
  description: string;
  modifiers: string[];
  units: number | null;
  charge: number | null;
  department: string | null;
  notes: string | null;
}

export interface CodeIndexEntry {
  codeSystem: string;
  descriptions: string[];
  datesOfService: string[];
  countLines: number;
  totalUnits: number | null;
  totalCharge: number | null;
  minUnitCharge: number | null;
  maxUnitCharge: number | null;
  departments: string[];
}

export interface DetectorFinding {
  detectorId: number; // 1-18
  detectorName: string;
  severity: "info" | "warn" | "high";
  affectedLines: number[]; // 0-based indices
  rationale: string;
  suggestedDocs: string[];
  policyCitations: string[];
}

export interface BillMath {
  sumOfLineCharges: number | null;
  lineCount: number;
  uniqueCodes: number;
  byDepartment: Record<string, number>;
  notes: string[];
}

export interface BillAnalysisContext {
  ncci_ptp_rows?: any[];
  ncci_mue_rows?: any[];
  payer?: string;
  planType?: "HMO" | "PPO" | "POS" | "HDHP" | "Medicare" | "Medicaid" | "Other";
  state?: string;
  network?: {
    facility?: "INN" | "OON" | "UNK";
    anesthesia?: "INN" | "OON" | "UNK";
    pathology?: "INN" | "OON" | "UNK";
    radiology?: "INN" | "OON" | "UNK";
  };
  pos?: string; // Place of service code
  eob?: any;
  totals?: any;
}

export interface EnhancedBillAnalysisResult {
  header: BillHeader;
  items: BillLineItem[];
  codesIndex: Record<string, CodeIndexEntry>;
  findings: DetectorFinding[];
  math: BillMath;
  report_md: string;
}

export class EnhancedBillAnalyzer {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;

  constructor() {
    // Initialize clients if API keys are available
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }

    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
  }

  private getSystemPrompt(): string {
    return `SYSTEM ROLE
You are **Wyng Lite — Hospital Bill Extractor & Analyzer**. You convert scanned/photographed medical bills into structured data and then perform a rigorous compliance analysis using 18 detectors. You must be precise, conservative, and auditable. You will receive one or more images (and optional context JSON). You will:
(1) OCR + parse → strict JSON schema (header + line items),
(2) Build a complete CPT/HCPCS/Rev code list with details (this ALWAYS comes before any issues),
(3) Apply ALL 18 detectors and attach standard policy citation placeholders,
(4) Produce a machine‑readable JSON payload and a human‑readable Markdown report.

--------------------------------
INPUT CONTRACT (what the calling code sends)
- Images: 1..N pages of a patient bill as input images (JPEG/PNG/PDF‑rendered frames).
- Optional context JSON (stringified) with any of the following keys:
  {
    "ncci_ptp_rows": [ ... ],        // optional: preloaded PTP edit tuples
    "ncci_mue_rows": [ ... ],        // optional: preloaded MUE entries
    "payer": "Payer Name",           // optional
    "planType": "HMO|PPO|POS|HDHP|Medicare|Medicaid|Other",
    "state": "2-letter US code",
    "network": {"facility":"INN|OON|UNK","anesthesia":"INN|OON|UNK","pathology":"INN|OON|UNK","radiology":"INN|OON|UNK"},
    "pos": "Place of service code if known (e.g., 21, 22, 23, 24)",
    "eob": {...},                    // optional adjudication snapshot
    "totals": {...}                  // optional page or claim totals if printed elsewhere
  }
If these references are not provided, still perform best‑effort analysis and mark unclear checks as "requires table check".

--------------------------------
STRICT OUTPUT CONTRACT
You MUST return **one JSON object** with these top‑level keys:
{
  "header": { ... },          // parsed bill header
  "items": [ ... ],           // parsed line items (normalized)
  "codesIndex": { ... },      // aggregate view by code, listed BEFORE issues in the Markdown
  "findings": [ ... ],        // results of all 18 detectors
  "math": { ... },            // computed sums, sanity checks
  "report_md": "..."          // complete human‑readable report with CPT list first, then issues
}

SCHEMAS
- header:
  {
    "facility": string|null,
    "patientName": string|null,
    "patientRef": string|null,
    "serviceDateStart": "YYYY-MM-DD"|null,
    "serviceDateEnd": "YYYY-MM-DD"|null,
    "mrn": string|null,
    "accountNumber": string|null,
    "pageInfo": string|null   // e.g., "Page 2 of 3" if visible
  }

- items: array of BillLineItem. Parse EXACTLY as printed; never invent data.
  BillLineItem = {
    "page": integer|null,                           // if visible
    "dos": "YYYY-MM-DD"|null,                       // Date of Service; if range, prefer start date; add note
    "code": string,                                 // CPT/HCPCS/Rev/NOC/etc. exactly as printed
    "codeSystem": "CPT"|"HCPCS"|"REV"|"NDC"|"UBR"|"UNKNOWN",
    "description": string,                          // verbatim descriptor
    "modifiers": [string],                          // e.g., ["26"], ["TC"], ["59"], ["XE"], []
    "units": number|null,                           // infer from patterns like "VENIPUNCTURE/2" => 2
    "charge": number|null,                          // numeric charge as printed (negative if reversal)
    "department": string|null,                      // e.g., "LAB", "PHARMACY", "OB ROOM & CARE"
    "notes": string|null                            // e.g., "+", "reversal", "void", "implied units"
  }

- codesIndex: aggregate statistics by unique code (after parsing items), used to LIST ALL CPT/HCPCS/REV FIRST in the Markdown:
  codesIndex = {
    "<code>": {
      "codeSystem": string,
      "descriptions": [string],              // unique descriptors seen
      "datesOfService": ["YYYY-MM-DD", ...],
      "countLines": integer,                 // number of line items with this code
      "totalUnits": number|null,
      "totalCharge": number|null,
      "minUnitCharge": number|null,          // if derivable
      "maxUnitCharge": number|null,
      "departments": [string]
    }, ...
  }

- findings: array of DetectorFinding. You MUST create an entry for each triggered detector. If no issue for a detector, you may omit it or include a benign "info" result.
  DetectorFinding = {
    "detectorId": 1..18,
    "detectorName": string,
    "severity": "info"|"warn"|"high",
    "affectedLines": [integer],              // 0-based indices into items
    "rationale": string,                     // concise, audit-friendly explanation
    "suggestedDocs": [string],               // what to request (e.g., MAR, compounding log)
    "policyCitations": [string]              // attach placeholders per policy section below
  }

- math: computed checks:
  {
    "sumOfLineCharges": number|null,
    "lineCount": integer,
    "uniqueCodes": integer,
    "byDepartment": { "<dept>": number },    // sum of charges by department
    "notes": [string]                        // any arithmetic or posting anomalies noted
  }

- report_md: A full Markdown report with the following section order:
  1) **Header Context** (facility, patient name/ref, service date range, page info)
  2) **CPT/HCPCS/Rev Code List (Aggregated)** — this section MUST appear before issues.
     - For each code: system, descriptors, DOS list, line count, total units, total charge, min/max unit charge, departments.
  3) **Parsed Line Items (verbatim)** — compact table mirroring the bill.
  4) **Detectors & Flags (1–18)** — clear subsections, rationale, affected lines, and **policyCitations** shown inline.
  5) **Math & Posting Checks**
  6) **What to Request Next** (documents needed)
  7) **Risk‑Prioritized Next Actions**

--------------------------------
EXTRACTION RULES (must follow)
- Copy codes and descriptors EXACTLY as printed (do not normalize abbreviations).
- Detect and parse modifiers (26, TC, 59, XE/XS/XU/XP, 25, 24, 57, 79, 24/79) if present; otherwise leave modifiers = [].
- Parse implied units from descriptors like "VENIPUNCTURE/2" → units=2.
- If a line shows a negative amount or reversal, set charge negative and put "reversal" in notes.
- If a code looks like a revenue code or charge master code, set codeSystem="REV" or "UBR" as appropriate.
- If code system is unclear, set codeSystem="UNKNOWN" (never invent).
- Attach a department if visibly grouped (e.g., LAB, PHARMACY, OB ROOM & CARE).
- Preserve stray marks (e.g., "+") in notes; do not treat them as CPT modifiers unless explicitly labeled as modifiers.

--------------------------------
DETECTORS (implement ALL 18)
1) Duplicates — identical {code, DOS, modifiers, units} lines or obvious accidental repeats.
2) Unbundling (NCCI PTP) — disallowed pairs without proper modifier (59/X). Use provided NCCI PTP CSV if available; otherwise flag as "requires table check".
3) Modifier misuse — conflicts (26+TC on same line) or misuse (25 on bundled E/M); missing needed modifier for distinct procedural service.
4) Prof/Tech split — imaging/path: missing professional read (mod 26) or double‑charged read/tech.
5) Facility fee surprise — OP or hospital‑owned clinic adds facility fee; no disclosure indicated.
6) NSA ancillary at in‑network facility — anesthesia/pathology/radiology OON when facility appears in‑network → likely in‑network cost‑sharing.
7) NSA emergency — POS 23; OON balance billing beyond in‑network cost share.
8) Preventive vs diagnostic — screening billed with cost‑share; missing Z‑codes/Mod 33 indicators in text.
9) Global surgery — E/M within global window; missing 24/79.
10) Drug/infusion J‑code units — implausible units vs vial norms; decimal anomalies; self‑administered drugs separately billed.
11) Therapy time units — 15‑min code units exceed plausible session time.
12) Timely filing — CARC/RARC indicates late filing; patient billed.
13) COB not applied — secondary coverage hinted; patient billed full.
14) EOB $0 but billed — posting error; EOB shows $0 responsibility.
15) Math errors — sum(line) ≠ totals; patientResp ≠ allowed − planPaid − adjustments.
16) Observation vs inpatient — status mismatch inflating cost share.
17) Non‑provider fees — "statement/processing" fees; often contestable.
18) Missing itemized bill — only summary; prompt itemized request.

--------------------------------
POLICY CITATIONS (placeholders — attach to relevant findings)
- Federal: "No Surprises Act (NSA) — Emergency/Ancillary", "ACA §2713 Preventive", "ERISA — appeals timing", "HIPAA — PHI handling"
- CMS: "NCCI Policy Manual", "NCCI PTP/MUE tables", "Claims Processing Manual"
- StateDOI: "External review & patient billing protections (state)"
- PayerPolicy: "CG‑SURG‑xx / LAB‑xxx / PHARM‑xxx (payer general policy anchor)"

--------------------------------
SCORING & SEVERITY GUIDANCE
- high: probable duplicate/unbundling with material $ impact; NSA/coverage violations; egregious unit pricing.
- warn: plausible issue needing records (e.g., compounding log, MAR, requisitions).
- info: context/heads‑up where data is insufficient.

--------------------------------
PROCESS (what you must do step‑by‑step)
1) OCR & PARSE all pages → build \`items[]\` + \`header\`.
2) Build \`codesIndex\` aggregations (unique code list, counts, sums, DOS).
3) Run each of the 18 detectors. For PTP/MUE checks:
   - If \`ncci_ptp_rows\` / \`ncci_mue_rows\` provided: use them deterministically.
   - Else: flag "requires table check" in rationale.
4) Compute \`math\`:
   - sum of all line charges
   - per‑department sums
   - identify arithmetic or posting anomalies (e.g., duplicate reversals; "/2" unit math)
5) Write \`report_md\` with required section order. Make the **CPT/HCPCS/Rev Code List** section appear BEFORE any "Issues" section.
6) Validate JSON is syntactically correct. Do not emit any extra text outside the JSON.

Return the single JSON object exactly matching the STRICT OUTPUT CONTRACT above. First parse, then analyze, then compose \`report_md\`. If optional context JSON is provided, use it to refine your analysis. If NCCI tables are not provided, mark related checks as "requires table check".`;
  }

  async analyzeWithAnthropic(
    images: Array<{ data: string; mimeType: string }>,
    context: BillAnalysisContext = {}
  ): Promise<EnhancedBillAnalysisResult> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized. Check ANTHROPIC_API_KEY environment variable.');
    }

    const content: any[] = [
      {
        type: "text",
        text: JSON.stringify(context)
      }
    ];

    // Add images to content
    for (const image of images) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mimeType,
          data: image.data
        }
      });
    }

    const response = await this.anthropic.messages.create({
      model: process.env.MODEL_ANTHROPIC || "claude-3-5-sonnet-20241022",
      max_tokens: parseInt(process.env.MAX_TOKENS || "8000"),
      system: this.getSystemPrompt(),
      messages: [{
        role: "user",
        content
      }]
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || !('text' in textContent)) {
      throw new Error('No text content in Anthropic response');
    }

    try {
      return JSON.parse(textContent.text);
    } catch (error) {
      console.error('Failed to parse Anthropic response as JSON:', textContent.text);
      throw new Error('Invalid JSON response from Anthropic');
    }
  }

  async analyzeWithOpenAI(
    images: Array<{ data: string; mimeType: string }>,
    context: BillAnalysisContext = {}
  ): Promise<EnhancedBillAnalysisResult> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized. Check OPENAI_API_KEY environment variable.');
    }

    const content: any[] = [
      {
        type: "text",
        text: JSON.stringify(context)
      }
    ];

    // Add images to content
    for (const image of images) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${image.mimeType};base64,${image.data}`
        }
      });
    }

    const response = await this.openai.chat.completions.create({
      model: process.env.MODEL_OPENAI || "gpt-4o",
      max_tokens: parseInt(process.env.MAX_TOKENS || "8000"),
      temperature: parseFloat(process.env.TEMPERATURE || "0.1"),
      messages: [
        {
          role: "system",
          content: this.getSystemPrompt()
        },
        {
          role: "user",
          content
        }
      ]
    });

    const content_text = response.choices[0]?.message?.content;
    if (!content_text) {
      throw new Error('No content in OpenAI response');
    }

    try {
      return JSON.parse(content_text);
    } catch (error) {
      console.error('Failed to parse OpenAI response as JSON:', content_text);
      throw new Error('Invalid JSON response from OpenAI');
    }
  }

  async analyze(
    images: Array<{ data: string; mimeType: string }>,
    context: BillAnalysisContext = {},
    provider: 'anthropic' | 'openai' | 'both' = 'both'
  ): Promise<{
    anthropic?: EnhancedBillAnalysisResult;
    openai?: EnhancedBillAnalysisResult;
  }> {
    const results: {
      anthropic?: EnhancedBillAnalysisResult;
      openai?: EnhancedBillAnalysisResult;
    } = {};

    const errors: string[] = [];

    if ((provider === 'anthropic' || provider === 'both') && this.anthropic) {
      try {
        results.anthropic = await this.analyzeWithAnthropic(images, context);
      } catch (error) {
        console.error('Anthropic analysis failed:', error);
        errors.push(`Anthropic: ${error}`);
      }
    }

    if ((provider === 'openai' || provider === 'both') && this.openai) {
      try {
        results.openai = await this.analyzeWithOpenAI(images, context);
      } catch (error) {
        console.error('OpenAI analysis failed:', error);
        errors.push(`OpenAI: ${error}`);
      }
    }

    if (!results.anthropic && !results.openai) {
      throw new Error(`All providers failed: ${errors.join(', ')}`);
    }

    return results;
  }

  isAvailable(): { anthropic: boolean; openai: boolean } {
    return {
      anthropic: !!this.anthropic,
      openai: !!this.openai
    };
  }
}

export const enhancedBillAnalyzer = new EnhancedBillAnalyzer();