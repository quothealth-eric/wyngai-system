import type { ParsedLine } from "./normalize";

export type MoneyCents = number;

export interface PricedLine {
  lineId: string;
  code?: string;
  codeSystem?: "CPT" | "HCPCS" | "REV" | "POS";
  description?: string;
  units?: number;
  dos?: string;
  pos?: string;
  revCode?: string;
  npi?: string;
  charge?: MoneyCents;
  allowed?: MoneyCents;
  planPaid?: MoneyCents;
  patientResp?: MoneyCents;
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
  lines: PricedLine[];
}

export function toPricedSummary(
  parsed: ParsedLine[],
  header?: PricedSummary["header"]
): PricedSummary {
  console.log(`💰 Converting ${parsed.length} parsed lines to priced summary`);

  const lines: PricedLine[] = parsed.map((p, i) => ({
    lineId: `ln_${i + 1}`,
    code: p.code,
    codeSystem: p.codeSystem,
    description: p.description,
    units: p.units,
    dos: p.dos,
    pos: p.pos,
    revCode: p.revCode,
    npi: p.npi,
    charge: p.charge,
    allowed: p.allowed,
    planPaid: p.planPaid,
    patientResp: p.patientResp
  }));

  // Calculate totals
  const billed = lines.reduce((sum, line) => sum + (line.charge || 0), 0);
  const allowed = lines.reduce((sum, line) => sum + (line.allowed || 0), 0);
  const planPaid = lines.reduce((sum, line) => sum + (line.planPaid || 0), 0);
  const patientResp = lines.reduce((sum, line) => sum + (line.patientResp || 0), 0);

  console.log(`📊 Totals calculated: billed=$${(billed / 100).toFixed(2)}, allowed=$${(allowed / 100).toFixed(2)}, planPaid=$${(planPaid / 100).toFixed(2)}, patientResp=$${(patientResp / 100).toFixed(2)}`);

  return {
    header: header || {},
    totals: {
      billed: billed > 0 ? billed : undefined,
      allowed: allowed > 0 ? allowed : undefined,
      planPaid: planPaid > 0 ? planPaid : undefined,
      patientResp: patientResp > 0 ? patientResp : undefined
    },
    lines
  };
}