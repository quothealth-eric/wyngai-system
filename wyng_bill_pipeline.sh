#!/usr/bin/env bash
# Wyng Lite — Bill Analyzer + Appeals + AI Chat (Anthropic + OpenAI)
# Usage:
#   ANTHROPIC_API_KEY=... OPENAI_API_KEY=... ./wyng_bill_pipeline.sh \
#     --context '{"state":"FL","planType":"PPO"}' \
#     --desc 'Induced delivery; anesthesia OON; billed $601/IV fluid twice.' \
#     page1.jpg page2.jpg page3.jpg
#
# Notes:
# - Calls BOTH Anthropic (Claude) and OpenAI (GPT-4o) with the same system prompt.
# - Produces: out/analysis.anthropic.json, out/analysis.openai.json (if available),
#             out/analysis.selected.json (preferred), out/report.md,
#             out/appeals_package.anthropic.json (and/or openai), out/appeals.md,
#             out/chat_example.json
# - Set MODEL_ANTHROPIC / MODEL_OPENAI to override defaults.

set -euo pipefail

: "${MODEL_ANTHROPIC:=claude-3-5-sonnet-latest}"
: "${MODEL_OPENAI:=gpt-4o}"
: "${MAX_TOKENS:=9000}"
: "${TEMPERATURE:=0.1}"
: "${PROVIDER_PREF:=anthropic}"   # 'anthropic'|'openai'|'first-success'

mkdir -p out

# ---------- Parse args ----------
CTX='{}'
DESC=''
IMGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context|-c) CTX="$2"; shift 2;;
    --context-file|-C) CTX="$(cat "$2")"; shift 2;;
    --desc|-d) DESC="$2"; shift 2;;
    --desc-file|-D) DESC="$(cat "$2")"; shift 2;;
    *) IMGS+=("$1"); shift 1;;
  esac
done

if [[ ${#IMGS[@]} -lt 1 ]]; then
  echo "Please pass 1+ bill images: page1.jpg [page2.png ...]" >&2; exit 1
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need jq; need curl; need base64

mime_for() { case "${1##*.}" in jpg|jpeg) echo "image/jpeg";; png) echo "image/png";; webp) echo "image/webp";; heic) echo "image/heic";; pdf) echo "application/pdf";; *) echo "image/jpeg";; esac; }
b64() { if base64 --help 2>/dev/null | grep -q -- -w; then base64 -w0 "$1"; else base64 <"$1" | tr -d '\n'; fi; }

# ---------- Authoritative citation KB (for accurate legal cites in outputs) ----------
CITATION_KB=$(cat <<'JSON'
{
  "citations": [
    {
      "id":"nsa_149110",
      "title":"45 CFR §149.110 – Preventing surprise medical bills for emergency services",
      "url":"https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-B/section-149.110",
      "jurisdiction":"Federal",
      "topic":"NSA Emergency",
      "pinpoint":"coverage without prior auth; no greater cost-sharing for OON emergency"
    },
    {
      "id":"nsa_149410",
      "title":"45 CFR §149.410 – Balance billing in cases of emergency services",
      "url":"https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-E/section-149.410",
      "jurisdiction":"Federal",
      "topic":"NSA Balance Billing – Emergency",
      "pinpoint":"ban on balance billing beyond in-network cost-sharing for OON emergency"
    },
    {
      "id":"nsa_149420",
      "title":"45 CFR §149.420 – Balance billing for non-emergency services (notice & consent)",
      "url":"https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-E/section-149.420",
      "jurisdiction":"Federal",
      "topic":"NSA Non‑Emergency at INN facility; notice/consent exception",
      "pinpoint":"requirements for valid notice/consent"
    },
    {
      "id":"nsa_149430",
      "title":"45 CFR §149.430 – Provider/facility disclosure of protections",
      "url":"https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-E/section-149.430",
      "jurisdiction":"Federal",
      "topic":"NSA Disclosure",
      "pinpoint":"disclosure timing/method requirements"
    },
    {
      "id":"phsa_300gg111",
      "title":"42 U.S.C. §300gg‑111 – Preventing surprise medical bills",
      "url":"https://www.law.cornell.edu/uscode/text/42/300gg-111",
      "jurisdiction":"Federal",
      "topic":"NSA Statute",
      "pinpoint":"plan obligations & payment/denial timing"
    },
    {
      "id":"aca_300gg13",
      "title":"42 U.S.C. §300gg‑13 – Preventive services coverage",
      "url":"https://www.law.cornell.edu/uscode/text/42/300gg-13",
      "jurisdiction":"Federal",
      "topic":"ACA Preventive",
      "pinpoint":"A/B USPSTF, ACIP, HRSA women/children – no cost‑sharing"
    },
    {
      "id":"cfr_147_130",
      "title":"45 CFR §147.130 – Coverage of preventive health services",
      "url":"https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-147/section-147.130",
      "jurisdiction":"Federal",
      "topic":"ACA Preventive (regulation)",
      "pinpoint":"no cost‑sharing for qualified preventive"
    },
    {
      "id":"erisa_2560_503_1",
      "title":"29 CFR §2560.503‑1 – ERISA claims procedure",
      "url":"https://www.law.cornell.edu/cfr/text/29/2560.503-1",
      "jurisdiction":"Federal",
      "topic":"Appeals/Timelines",
      "pinpoint":"full & fair review; timeframes"
    },
    {
      "id":"hipaa_164_524",
      "title":"45 CFR §164.524 – HIPAA right of access",
      "url":"https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.524",
      "jurisdiction":"Federal",
      "topic":"Records Access",
      "pinpoint":"timely access to PHI; copies of records/MAR"
    },
    {
      "id":"cms_ncci_policy_manual",
      "title":"CMS – Medicare NCCI Policy Manual (general correct coding)",
      "url":"https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-policy-manual",
      "jurisdiction":"CMS",
      "topic":"NCCI Policies",
      "pinpoint":"unbundling, modifier 59/X"
    },
    {
      "id":"cms_ncci_ptp",
      "title":"CMS – NCCI Procedure‑to‑Procedure (PTP) Edits (quarterly)",
      "url":"https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-procedure-procedure-ptp-edits",
      "jurisdiction":"CMS",
      "topic":"PTP Edits",
      "pinpoint":"disallowed pairs & modifier indicators"
    },
    {
      "id":"cms_ncci_mue",
      "title":"CMS – NCCI Medically Unlikely Edits (MUE)",
      "url":"https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-medically-unlikely-edits",
      "jurisdiction":"CMS",
      "topic":"MUE Units",
      "pinpoint":"max units per HCPCS/CPT per DOS"
    },
    {
      "id":"inpatient_412_3",
      "title":"42 CFR §412.3 – Admissions",
      "url":"https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-412/subpart-A/section-412.3",
      "jurisdiction":"CMS",
      "topic":"Inpatient vs Observation",
      "pinpoint":"admission order requirements"
    },
    {
      "id":"nsa_notice_forms",
      "title":"HHS Standard Notice & Consent Forms (NSA)",
      "url":"https://www.cms.gov/files/document/standard-notice-consent-forms-nonparticipating-providers-emergency-facilities-regarding-consumer.pdf",
      "jurisdiction":"HHS",
      "topic":"NSA Notice/Consent",
      "pinpoint":"form & manner deemed good‑faith compliance"
    }
  ]
}
JSON
)

# ---------- Unified SYSTEM prompt for Analyzer (OCR + 18 detectors + report) ----------
ANALYZER_PROMPT=$(cat <<'PROMPT'
SYSTEM ROLE
You are **Wyng Lite — Hospital Bill Extractor & Analyzer**. You must:
(1) OCR+parse one or more bill images into a strict JSON schema,
(2) Build a complete **CPT/HCPCS/Rev code list** (aggregated) — this must appear BEFORE issues in the Markdown,
(3) Apply ALL **18 detectors** (listed below) with policy citations from CITATION_KB,
(4) Merge the user's free‑text **description** with parsed content into a single **combinedQuery** used to tailor findings,
(5) Output a single JSON object and a comprehensive Markdown **report_md**.

STRICT OUTPUT (return ONE JSON object):
{
  "header": {...},
  "items": [ ... BillLineItem ... ],
  "codesIndex": { "<code>": {...} },
  "combinedQuery": string,
  "findings": [ ... DetectorFinding ... ],
  "math": { "sumOfLineCharges": number|null, "lineCount": number, "uniqueCodes": number,
            "byDepartment": { "<dept>": number }, "notes": [string] },
  "report_md": "..."
}

SCHEMAS
- header: { "facility":string|null, "patientName":string|null, "patientRef":string|null,
            "serviceDateStart":"YYYY-MM-DD"|null, "serviceDateEnd":"YYYY-MM-DD"|null,
            "mrn":string|null, "accountNumber":string|null, "pageInfo":string|null }
- BillLineItem: {
    "page":integer|null, "dos":"YYYY-MM-DD"|null, "code":string, "codeSystem":"CPT"|"HCPCS"|"REV"|"NDC"|"UBR"|"UNKNOWN",
    "description":string, "modifiers":[string], "units":number|null, "charge":number|null,
    "department":string|null, "notes":string|null
  }
- DetectorFinding: {
    "detectorId":1..18,"detectorName":string,"severity":"info"|"warn"|"high",
    "affectedLines":[integer],"rationale":string,"suggestedDocs":[string],"policyCitations":[string]
  }

EXTRACTION RULES (must follow)
- Copy codes/descriptors EXACTLY as printed (no normalization).
- Detect modifiers (26, TC, 59, XE/XS/XU/XP, 25, 24, 57, 79, "24/79" text).
- Parse implied units (e.g., "VENIPUNCTURE/2" => units=2).
- Negative lines => charge negative; include notes:"reversal".
- Revenue/chargemaster codes => codeSystem="REV" or "UBR"; unknown => "UNKNOWN".
- Attach department if visually grouped (LAB, PHARMACY, OB ROOM & CARE, etc.).
- Preserve stray marks ("+") in notes; do NOT treat them as CPT modifiers unless labeled.

DETECTORS (implement ALL 18)
1) Duplicates — identical {code, DOS, modifiers, units} or obvious accidental repeats.
2) Unbundling (NCCI PTP) — disallowed pairs without proper modifier (59/X). Use provided PTP edits if included; otherwise say "requires table check".
3) Modifier misuse — conflicts (26+TC on same line) or misuse (25 on bundled E/M); missing needed modifier.
4) Prof/Tech split — imaging/path: missing professional read (26) or double‑charged read/tech.
5) Facility fee surprise — OP or hospital‑owned clinic adds facility fee; no disclosure indicated.
6) NSA ancillary at in‑network facility — anesthesia/path/radiology OON while facility INN ⇒ in‑network cost sharing likely.
7) NSA emergency — POS 23; OON balance billing beyond in‑network cost share.
8) Preventive vs diagnostic — screening billed with cost‑share; missing Z‑codes/Mod 33 indicators.
9) Global surgery — E/M within global window; missing 24/79.
10) Drug/infusion J‑code units — implausible units vs vial norms; decimal anomalies; self‑administered drugs billed separately.
11) Therapy time units — 15‑min code units exceed plausible session time.
12) Timely filing — CARC/RARC indicates late filing; patient billed.
13) COB not applied — secondary coverage hinted; patient billed full.
14) EOB $0 but billed — posting error; EOB shows $0 responsibility.
15) Math errors — sum(line) ≠ totals; patientResp ≠ allowed − planPaid − adjustments.
16) Observation vs inpatient — status mismatch inflating cost share.
17) Non‑provider fees — "statement/processing" fees; often contestable.
18) Missing itemized bill — only summary; request a full itemized statement.

POLICY CITATIONS
Use IDs from CITATION_KB; attach relevant ones to each finding:
- NSA: 45 CFR §§149.110, 149.120, 149.410, 149.420; 45 CFR §149.430; 42 U.S.C. §300gg‑111
- ACA Preventive: 42 U.S.C. §300gg‑13; 45 CFR §147.130
- ERISA Appeals: 29 CFR §2560.503‑1
- HIPAA Access: 45 CFR §164.524
- CMS NCCI: Policy Manual; PTP/MUE tables
- Inpatient/Observation: 42 CFR §412.3
Include State DOI external review when state is given (cite NAIC Model #76 if specific statute unknown).

PROCESS
1) OCR+parse every page → header+items.
2) Aggregate **codesIndex**: by code — descriptors, DOS list, line count, total units, total charge, min/max per‑unit, departments.
3) Create **combinedQuery**: natural‑language summary merging header, key charges, and user description/context.
4) Run all 18 detectors; use PTP/MUE data if provided in context; else annotate "requires table check".
5) Compute **math**: totals, per‑department sums, anomalies (e.g., /2 unit handling).
6) Generate **report_md** in this order:
   1) Header Context
   2) CPT/HCPCS/Rev Code List (Aggregated)
   3) Parsed Line Items (verbatim)
   4) Detectors & Flags (1–18) with inline **policyCitations**
   5) Math & Posting Checks
   6) What to Request Next
   7) Risk‑Prioritized Next Actions
Return JSON ONLY; no extra text.
PROMPT
)

# ---------- Appeals + Phone Scripts prompt (consumes analyzer JSON) ----------
APPEALS_PROMPT=$(cat <<'PROMPT'
SYSTEM ROLE
You draft consumer‑ready **appeal packages** based on a prior Wyng Lite bill analysis JSON and CITATION_KB.
Return ONE JSON object:
{
  "appeals": {
    "checklist": [string],                    // ordered steps for the user
    "docRequests": [string],                  // what to request (e.g., MAR, compounding logs)
    "letters": {
      "payer_appeal": { "subject":string, "body_md":string, "citations":[string] },
      "provider_dispute": { "subject":string, "body_md":string, "citations":[string] },
      "state_doi_complaint": { "subject":string, "body_md":string, "citations":[string] }
    },
    "phone_scripts": {
      "insurer": "markdown script with checkpoints and required data",
      "provider": "markdown script",
      "state_doi": "markdown script"
    }
  }
}

REQUIREMENTS
- Ground every allegation with specific **finding IDs** and attach **CITATION_KB** ids (e.g., "nsa_149410", "cms_ncci_ptp").
- Tailor to the **state** and **planType** when present in context; if state law unknown, reference **NAIC Model #76** and direct to State DOI.
- Tone: respectful, firm, consumer‑friendly. Include dates, claim numbers if present.
- Include explicit asks: reprocessing under NSA/ACA rules, removal of duplicates, application of in‑network cost‑sharing, refund/zero balance.
- Provide a short **escalation path** if payer/provider refuses.
Return JSON ONLY.
PROMPT
)

# ---------- AI Chat system prompt (contextual helper) ----------
CHAT_PROMPT=$(cat <<'PROMPT'
SYSTEM ROLE
You are **Wyng Guide**, a contextual AI chat assistant. You answer questions using:
(a) the analyzer JSON (header, items, findings, math, report_md),
(b) the user's description/context,
(c) CITATION_KB.
Always cite using CITATION_KB ids inline where legal rules are invoked. If a user asks for next steps, synthesize a succinct checklist referencing the specific findings by detectorId and code. Keep answers precise and actionable. Return plain text (Markdown allowed).
PROMPT
)

# ---------- Build model message content ----------
# Build Anthropic "content": first a JSON block carrying user context + citations, then images
USER_CONTEXT_JSON=$(jq -n --argjson kb "$CITATION_KB" --arg ctx "$CTX" --arg desc "$DESC" '
  ($ctx|fromjson? // {}) as $ctxobj |
  {
    "citations_kb": $kb,
    "context": $ctxobj,
    "description": $desc
  }')

ANTH_CONTENT=$(jq -n --arg json "$USER_CONTEXT_JSON" '[{"type":"text","text":$json}]')
for f in "${IMGS[@]}"; do
  MT=$(mime_for "$f"); DATA=$(b64 "$f")
  ANTH_CONTENT=$(jq --arg mt "$MT" --arg data "$DATA" \
    '. + [{"type":"input_image","source":{"type":"base64","media_type":$mt,"data":$data}}]' <<<"$ANTH_CONTENT")
done

# Build OpenAI "content": a text JSON then image_url objects
OAI_CONTENT=$(jq -n --arg json "$USER_CONTEXT_JSON" '[{"type":"text","text":$json}]')
for f in "${IMGS[@]}"; do
  MT=$(mime_for "$f"); DATA=$(b64 "$f"); URL="data:$MT;base64,$DATA"
  OAI_CONTENT=$(jq --arg url "$URL" '. + [{"type":"image_url","image_url":{"url":$url}}]' <<<"$OAI_CONTENT")
done

ANTH_PAYLOAD=$(jq -n \
  --arg model "$MODEL_ANTHROPIC" --arg system "$ANALYZER_PROMPT" \
  --argjson content "$ANTH_CONTENT" --argjson max "$MAX_TOKENS" \
  '{model:$model,max_tokens:($max|tonumber),system:$system,messages:[{role:"user",content:$content}]}' )

OAI_PAYLOAD=$(jq -n \
  --arg model "$MODEL_OPENAI" --arg system "$ANALYZER_PROMPT" \
  --argjson content "$OAI_CONTENT" --argjson max "$MAX_TOKENS" --argjson temp "$TEMPERATURE" \
  '{model:$model,max_tokens:($max|tonumber),temperature:($temp|tonumber),messages:[{role:"system",content:$system},{role:"user",content:$content}]}' )

# ---------- Call providers (Analyzer stage) ----------
SEL=""
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "→ Anthropic analyze ($MODEL_ANTHROPIC)"
  curl -sS https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" -d "$ANTH_PAYLOAD" > out/anthropic_raw.json
  AN=$(jq -r '.content[0].text // empty' out/anthropic_raw.json)
  if jq -e . >/dev/null 2>&1 <<<"$AN"; then
    printf "%s" "$AN" > out/analysis.anthropic.json
    jq -r '.report_md // ""' out/analysis.anthropic.json > out/report.anthropic.md || true
    SEL="anthropic"
  else
    echo "Anthropic returned non-JSON or empty; see out/anthropic_raw.json" >&2
  fi
else
  echo "! ANTHROPIC_API_KEY not set — skipping Anthropic"
fi

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  echo "→ OpenAI analyze ($MODEL_OPENAI)"
  curl -sS https://api.openai.com/v1/chat/completions \
    -H "authorization: Bearer $OPENAI_API_KEY" -H "content-type: application/json" \
    -d "$OAI_PAYLOAD" > out/openai_raw.json
  OA=$(jq -r '.choices[0].message.content // empty' out/openai_raw.json)
  if jq -e . >/dev/null 2>&1 <<<"$OA"; then
    printf "%s" "$OA" > out/analysis.openai.json
    jq -r '.report_md // ""' out/analysis.openai.json > out/report.openai.md || true
    [[ -z "$SEL" ]] && SEL="openai"
  else
    echo "OpenAI returned non-JSON or empty; see out/openai_raw.json" >&2
  fi
else
  echo "! OPENAI_API_KEY not set — skipping OpenAI"
fi

if [[ -z "$SEL" ]]; then
  echo "No provider returned valid JSON; aborting." >&2; exit 2
fi

# Choose preferred analysis JSON
case "$PROVIDER_PREF" in
  anthropic) [[ -f out/analysis.anthropic.json ]] && cp out/analysis.anthropic.json out/analysis.selected.json || cp out/analysis.openai.json out/analysis.selected.json ;;
  openai)    [[ -f out/analysis.openai.json ]] && cp out/analysis.openai.json out/analysis.selected.json || cp out/analysis.anthropic.json out/analysis.selected.json ;;
  first-success) cp "out/analysis.$SEL.json" out/analysis.selected.json ;;
esac
jq -r '.report_md // ""' out/analysis.selected.json > out/report.md || true
echo "✓ Analyzer complete → out/analysis.selected.json, out/report.md"

# ---------- Appeals & Phone scripts (run on both providers that succeeded) ----------
build_appeals_payload() {
  local ANALYSIS_JSON="$1"
  jq -n \
    --arg sys "$APPEALS_PROMPT" \
    --argjson analysis "$(cat "$ANALYSIS_JSON")" \
    --argjson kb "$CITATION_KB" \
    --argjson max "$MAX_TOKENS" \
    '{
      model: env.MODEL_ANTHROPIC,
      max_tokens: ($max|tonumber),
      system: $sys,
      messages: [{role:"user",content:[{"type":"text","text": ({"analysis":$analysis,"citations_kb":$kb}|tojson)}]}]
    }'
}

if [[ -f out/analysis.anthropic.json && -n "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "→ Anthropic appeals"
  APL=$(build_appeals_payload "out/analysis.anthropic.json")
  curl -sS https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" -d "$APL" > out/anthropic_appeals_raw.json
  AT=$(jq -r '.content[0].text // empty' out/anthropic_appeals_raw.json)
  if jq -e . >/dev/null 2>&1 <<<"$AT"; then
    printf "%s" "$AT" > out/appeals_package.anthropic.json
    jq -r '.appeals.letters.payer_appeal.body_md // empty' out/appeals_package.anthropic.json > out/appeal_payer.md || true
    jq -r '.appeals.letters.provider_dispute.body_md // empty' out/appeals_package.anthropic.json > out/appeal_provider.md || true
    jq -r '.appeals.letters.state_doi_complaint.body_md // empty' out/appeals_package.anthropic.json > out/complaint_state_doi.md || true
    echo "✓ Anthropic appeals → out/appeals_package.anthropic.json"
  fi
fi

if [[ -f out/analysis.openai.json && -n "${OPENAI_API_KEY:-}" ]]; then
  echo "→ OpenAI appeals"
  OA_APPEALS_PAYLOAD=$(jq -n \
    --arg sys "$APPEALS_PROMPT" \
    --argjson analysis "$(cat out/analysis.openai.json)" \
    --argjson kb "$CITATION_KB" \
    --argjson max "$MAX_TOKENS" --argjson temp "$TEMPERATURE" \
    '{
      model: env.MODEL_OPENAI,
      max_tokens: ($max|tonumber),
      temperature: ($temp|tonumber),
      messages: [
        {role:"system",content:$sys},
        {role:"user",content:[{"type":"text","text": ({"analysis":$analysis,"citations_kb":$kb}|tojson)}]}
      ]
    }')
  curl -sS https://api.openai.com/v1/chat/completions \
    -H "authorization: Bearer $OPENAI_API_KEY" -H "content-type: application/json" \
    -d "$OA_APPEALS_PAYLOAD" > out/openai_appeals_raw.json
  OT=$(jq -r '.choices[0].message.content // empty' out/openai_appeals_raw.json)
  if jq -e . >/dev/null 2>&1 <<<"$OT"; then
    printf "%s" "$OT" > out/appeals_package.openai.json
    echo "✓ OpenAI appeals → out/appeals_package.openai.json"
  fi
fi

# ---------- Example Chat call (answers follow-up questions using analysis JSON) ----------
CHAT_PAYLOAD=$(jq -n \
  --arg sys "$CHAT_PROMPT" \
  --argjson kb "$CITATION_KB" \
  --argjson analysis "$(cat out/analysis.selected.json)" \
  --arg desc "$DESC" --argjson max "$MAX_TOKENS" --argjson temp "$TEMPERATURE" '
  {
    model: env.MODEL_ANTHROPIC,
    max_tokens: ($max|tonumber),
    system: $sys,
    messages: [
      { role:"user",
        content:[{"type":"text","text": ({"citations_kb":$kb,"analysis":$analysis,"description":$desc,"userQuestion":"Summarize top 5 issues and give a one-page plan."}|tojson)}]
      }
    ]
  }')

if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "→ Anthropic chat example"
  curl -sS https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" -d "$CHAT_PAYLOAD" \
    | jq -r '.content[0].text' > out/chat_example.txt || true
  echo "✓ Chat example → out/chat_example.txt"
fi

echo "All outputs in ./out"
echo
echo "Git helper (start from commit c4e5528 on main):"
cat <<'GIT'
git fetch origin
git checkout main
git reset --hard c4e5528
git checkout -b feature/wyng-bill-analyzer
# add/modify code, commit:
git add .
git commit -m "feat(wyng): analyzer + appeals + chat (Anthropic/OpenAI, multi-doc, citations)"
# fast-forward main if still at c4e5528, otherwise rebase then push
BASE=$(git rev-parse origin/main)
if [ "$BASE" = "c4e5528" ]; then
  git checkout main
  git merge --ff-only feature/wyng-bill-analyzer
  git push origin main
else
  git checkout feature/wyng-bill-analyzer
  git rebase origin/main
  git checkout main
  git merge --no-ff feature/wyng-bill-analyzer
  git push origin main
fi
# Vercel picks up the push to main; or run:
# vercel --prod
GIT