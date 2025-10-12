import type { OcrRow } from "./vision";

// Deterministic validators - NO GUESSING, only match what we can validate
const CPT_REGEX = /^\d{5}$/;
const HCPCS_REGEX = /^[A-Z]\d{4}$/i;
const POS_REGEX = /^\d{2}$/;
const REV_REGEX = /^\d{3}$/;
const MONEY_REGEX = /^\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?$/;
const DOS_REGEX = /(?:(?:0[1-9]|1[0-2])[\/\-\.](?:0[1-9]|[12]\d|3[01])[\/\-\.](?:20\d{2}|\d{2}))/;

export interface ParsedLine {
  code?: string;
  codeSystem?: "CPT" | "HCPCS" | "REV" | "POS";
  modifiers?: string[];
  description?: string;
  units?: number;
  dos?: string;
  pos?: string;
  revCode?: string;
  npi?: string;
  charge?: number; // in cents
  allowed?: number; // in cents
  planPaid?: number; // in cents
  patientResp?: number; // in cents
}

const moneyToCents = (s?: string | null): number | undefined => {
  if (!s || !MONEY_REGEX.test(s)) return undefined;
  return Math.round(parseFloat(s.replace(/[$,]/g, "")) * 100);
};

export function parseBillTextToLines(fullText: string): ParsedLine[] {
  console.log(`📝 Parsing bill text: ${fullText.length} characters`);

  if (!fullText || fullText.trim().length === 0) {
    console.log(`⚠️ No text to parse`);
    return [];
  }

  const out: ParsedLine[] = [];
  const rawLines = fullText.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  console.log(`📋 Processing ${rawLines.length} lines of text`);

  for (const raw of rawLines) {
    // Heuristic: only process lines that contain at least one money amount
    const moneyMatches = raw.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})/g);
    if (!moneyMatches || moneyMatches.length === 0) {
      continue; // Skip lines without monetary amounts
    }

    const tokens = raw.split(/\s+/);
    let code: string | undefined;
    let codeSystem: ParsedLine["codeSystem"];
    let dos: string | undefined;
    let description = raw;

    // Code detection (look at first token, cleaned of punctuation)
    const firstToken = tokens[0]?.replace(/[^\w]/g, "");
    if (firstToken) {
      if (CPT_REGEX.test(firstToken)) {
        code = firstToken;
        codeSystem = "CPT";
        // Remove the code from description
        description = raw.slice(raw.indexOf(tokens[1] || "")).trim();
      } else if (HCPCS_REGEX.test(firstToken)) {
        code = firstToken.toUpperCase();
        codeSystem = "HCPCS";
        description = raw.slice(raw.indexOf(tokens[1] || "")).trim();
      } else if (POS_REGEX.test(firstToken)) {
        code = firstToken;
        codeSystem = "POS";
        description = raw.slice(raw.indexOf(tokens[1] || "")).trim();
      } else if (REV_REGEX.test(firstToken)) {
        code = firstToken;
        codeSystem = "REV";
        description = raw.slice(raw.indexOf(tokens[1] || "")).trim();
      }
    }

    // Date of service detection
    const dosMatch = raw.match(DOS_REGEX);
    if (dosMatch) {
      dos = dosMatch[0];
    }

    // For now, use the largest money amount as the charge
    // More sophisticated column detection would happen with AI parsing
    const sortedAmounts = moneyMatches
      .map(m => parseFloat(m.replace(/[$,]/g, "")))
      .sort((a, b) => b - a);

    const charge = Math.round((sortedAmounts[0] || 0) * 100);

    // Only include lines that have meaningful content
    if (charge > 0) {
      out.push({
        code,
        codeSystem,
        description: description.trim(),
        dos,
        charge
      });
    }
  }

  console.log(`✅ Parsed ${out.length} line items from text`);
  return dedupeNearDuplicates(out);
}

function dedupeNearDuplicates(rows: ParsedLine[]): ParsedLine[] {
  const seen = new Set<string>();
  const out: ParsedLine[] = [];

  for (const row of rows) {
    // Create a key based on code, partial description, amount, and date
    const key = JSON.stringify({
      c: row.code,
      d: row.description?.slice(0, 50), // First 50 chars of description
      a: row.charge,
      s: row.dos
    });

    if (seen.has(key)) {
      continue; // Skip near-duplicate
    }

    seen.add(key);
    out.push(row);
  }

  console.log(`🔍 Deduplication: ${rows.length} → ${out.length} unique items`);
  return out;
}