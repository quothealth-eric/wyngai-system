/**
 * 18-Rule Engine for Medical Billing Analysis
 * Analyzes parsed billing data for potential errors and savings opportunities
 */

import { PricedSummary, Detection, ParsedLine } from '@/lib/types/ocr';

/**
 * Run all 18 rules against the parsed summary
 */
export function runRuleEngine(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Execute each rule
  detections.push(...checkDuplicateLines(summary));
  detections.push(...checkUnbundlingNCCI(summary));
  detections.push(...checkModifierMisuse(summary));
  detections.push(...checkProfTechSplit(summary));
  detections.push(...checkFacilityFeeSurprise(summary));
  detections.push(...checkNSAAncillaryInNetwork(summary));
  detections.push(...checkNSAEmergency(summary));
  detections.push(...checkPreventiveVsDiagnostic(summary));
  detections.push(...checkGlobalSurgery(summary));
  detections.push(...checkJCodeUnitsSanity(summary));
  detections.push(...checkTherapyTimeUnits(summary));
  detections.push(...checkTimelyFiling(summary));
  detections.push(...checkCOBNotApplied(summary));
  detections.push(...checkEOBZeroBilled(summary));
  detections.push(...checkMathErrors(summary));
  detections.push(...checkObservationVsInpatient(summary));
  detections.push(...checkNonProviderFees(summary));
  detections.push(...checkMissingItemizedBill(summary));

  return detections;
}

/**
 * Rule 1: Duplicate Lines Detection
 */
function checkDuplicateLines(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];
  const seen = new Map<string, ParsedLine[]>();

  // Group lines by code + DOS + description
  for (const line of summary.lines) {
    const key = `${line.code || 'NO_CODE'}_${line.dos || 'NO_DATE'}_${(line.description || '').substring(0, 50)}`;

    if (!seen.has(key)) {
      seen.set(key, []);
    }
    seen.get(key)!.push(line);
  }

  // Find duplicates
  for (const [key, lines] of seen.entries()) {
    if (lines.length > 1) {
      const totalCharge = lines.reduce((sum, line) => sum + (line.charge || 0), 0);
      const avgCharge = totalCharge / lines.length;

      detections.push({
        ruleKey: 'duplicate_lines',
        severity: 'high',
        explanation: `Found ${lines.length} duplicate line items for ${lines[0].code || 'unknown code'}. This may indicate billing error or double charging.`,
        evidence: {
          lineRefs: lines.map(l => l.lineId),
          pageRefs: [...new Set(lines.map(l => l.page))]
        },
        citations: [{
          title: 'Medicare Claims Processing Manual',
          authority: 'CMS',
          citation: 'Chapter 23, Section 30.6.1 - Duplicate Services'
        }],
        savingsCents: totalCharge - avgCharge // Keep one, refund others
      });
    }
  }

  return detections;
}

/**
 * Rule 2: NCCI Unbundling Detection
 */
function checkUnbundlingNCCI(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];
  const cptLines = summary.lines.filter(line => line.codeSystem === 'CPT' && line.code);

  // Check for common unbundling patterns
  const commonUnbundledPairs = [
    // E&M + procedures on same day
    { primary: /^99\d{3}$/, component: /^(36415|93000|93005|71020)$/, name: 'E&M with simple procedure' },
    // Surgery + closure
    { primary: /^(11\d{3}|12\d{3})$/, component: /^(12\d{3}|13\d{3})$/, name: 'Surgery with closure' },
    // Anesthesia + monitoring
    { primary: /^00\d{3}$/, component: /^(93040|93041)$/, name: 'Anesthesia with monitoring' },
  ];

  for (const pair of commonUnbundledPairs) {
    const primaryLines = cptLines.filter(line => pair.primary.test(line.code!));
    const componentLines = cptLines.filter(line => pair.component.test(line.code!));

    if (primaryLines.length > 0 && componentLines.length > 0) {
      // Check if they're on the same date
      const sameDateComponents = componentLines.filter(comp =>
        primaryLines.some(prim => prim.dos === comp.dos)
      );

      if (sameDateComponents.length > 0) {
        const savingsAmount = sameDateComponents.reduce((sum, line) => sum + (line.charge || 0), 0);

        detections.push({
          ruleKey: 'unbundling_ncci',
          severity: 'high',
          explanation: `Potential unbundling detected: ${pair.name}. Component services should typically be included in the primary procedure.`,
          evidence: {
            lineRefs: [...primaryLines.map(l => l.lineId), ...sameDateComponents.map(l => l.lineId)]
          },
          citations: [{
            title: 'NCCI Procedure-to-Procedure Edits',
            authority: 'CMS',
            citation: 'NCCI Policy Manual Chapter 1'
          }],
          savingsCents: savingsAmount
        });
      }
    }
  }

  return detections;
}

/**
 * Rule 3: Modifier Misuse Detection
 */
function checkModifierMisuse(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  for (const line of summary.lines) {
    if (!line.modifiers || line.modifiers.length === 0) continue;

    // Check for inappropriate modifier usage
    for (const modifier of line.modifiers) {
      switch (modifier) {
        case '25': // Significant, separately identifiable E&M service
          if (!/^99\d{3}$/.test(line.code || '')) {
            detections.push({
              ruleKey: 'modifier_misuse',
              severity: 'warn',
              explanation: `Modifier 25 should only be used with E&M codes, but found on ${line.code}`,
              evidence: { lineRefs: [line.lineId] },
              citations: [{
                title: 'Medicare Claims Processing Manual',
                authority: 'CMS',
                citation: 'Chapter 12, Section 30.6.1B'
              }]
            });
          }
          break;

        case '59': // Distinct procedural service
          // Should have documentation supporting separate service
          detections.push({
            ruleKey: 'modifier_misuse',
            severity: 'info',
            explanation: `Modifier 59 usage on ${line.code} should be supported by documentation of distinct service`,
            evidence: { lineRefs: [line.lineId] },
            citations: [{
              title: 'Medicare Claims Processing Manual',
              authority: 'CMS',
              citation: 'Chapter 23, Section 20.9.2'
            }]
          });
          break;
      }
    }
  }

  return detections;
}

/**
 * Rule 4: Professional/Technical Component Split
 */
function checkProfTechSplit(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];
  const radLines = summary.lines.filter(line =>
    line.code && /^7[0-9]{4}$/.test(line.code) // Radiology codes
  );

  // Look for services that should be split but aren't
  for (const line of radLines) {
    const hasTC = line.modifiers?.includes('TC');
    const hasPC = line.modifiers?.includes('26');

    if (!hasTC && !hasPC && line.pos === '22') { // Outpatient hospital
      detections.push({
        ruleKey: 'prof_tech_split',
        severity: 'warn',
        explanation: `Radiology service ${line.code} in outpatient hospital setting should typically be split into professional (26) and technical (TC) components`,
        evidence: { lineRefs: [line.lineId] },
        citations: [{
          title: 'Medicare Physician Fee Schedule',
          authority: 'CMS',
          citation: 'Professional/Technical Component Billing'
        }]
      });
    }
  }

  return detections;
}

/**
 * Rule 5: Facility Fee Surprise Billing
 */
function checkFacilityFeeSurprise(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Look for facility fees at outpatient departments
  const facilityFees = summary.lines.filter(line =>
    line.revCode && ['450', '451', '452', '459'].includes(line.revCode)
  );

  const profServices = summary.lines.filter(line =>
    line.code && /^99\d{3}$/.test(line.code) // E&M codes
  );

  if (facilityFees.length > 0 && profServices.length > 0) {
    const totalFacilityFees = facilityFees.reduce((sum, line) => sum + (line.charge || 0), 0);

    detections.push({
      ruleKey: 'facility_fee_surprise',
      severity: 'high',
      explanation: 'Facility fees charged alongside professional services may constitute surprise billing if not properly disclosed',
      evidence: {
        lineRefs: [...facilityFees.map(l => l.lineId), ...profServices.map(l => l.lineId)]
      },
      citations: [{
        title: 'No Surprises Act',
        authority: 'Federal',
        citation: 'H.R.133 - Consolidated Appropriations Act, 2021'
      }],
      savingsCents: totalFacilityFees * 0.5 // Estimate 50% reduction
    });
  }

  return detections;
}

/**
 * Rule 6: NSA Ancillary Services at In-Network Facility
 */
function checkNSAAncillaryInNetwork(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Look for ancillary services (lab, radiology, anesthesia)
  const ancillaryServices = summary.lines.filter(line => {
    if (!line.code) return false;
    return /^(80\d{3}|8[1-9]\d{3}|7[0-9]\d{3}|00\d{3})$/.test(line.code);
  });

  if (ancillaryServices.length > 0 && summary.header.payer) {
    detections.push({
      ruleKey: 'nsa_ancillary_in_network_facility',
      severity: 'info',
      explanation: 'Ancillary services at in-network facilities should be covered at in-network rates under No Surprises Act',
      evidence: { lineRefs: ancillaryServices.map(l => l.lineId) },
      citations: [{
        title: 'No Surprises Act - Ancillary Services',
        authority: 'Federal',
        citation: 'Section 2799A-1(b) of the Public Health Service Act'
      }]
    });
  }

  return detections;
}

/**
 * Rule 7: NSA Emergency Services
 */
function checkNSAEmergency(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Look for emergency department codes
  const emergencyServices = summary.lines.filter(line =>
    line.code && /^99[2-3]\d{2}$/.test(line.code) || // ED visits
    line.revCode && ['0450', '0451', '0452', '0459', '0981'].includes(line.revCode)
  );

  if (emergencyServices.length > 0) {
    detections.push({
      ruleKey: 'nsa_emergency',
      severity: 'info',
      explanation: 'Emergency services should be covered at in-network rates regardless of provider network status',
      evidence: { lineRefs: emergencyServices.map(l => l.lineId) },
      citations: [{
        title: 'No Surprises Act - Emergency Services',
        authority: 'Federal',
        citation: 'Section 2799A-1(a) of the Public Health Service Act'
      }]
    });
  }

  return detections;
}

/**
 * Rule 8: Preventive vs Diagnostic Coding
 */
function checkPreventiveVsDiagnostic(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Look for preventive codes that might be miscoded as diagnostic
  const preventiveCodes = ['99391', '99392', '99393', '99394', '99395', '99396', '99397'];
  const diagnosticCodes = ['99201', '99202', '99203', '99204', '99205', '99211', '99212', '99213', '99214', '99215'];

  const preventiveLines = summary.lines.filter(line =>
    line.code && preventiveCodes.includes(line.code)
  );

  const diagnosticLines = summary.lines.filter(line =>
    line.code && diagnosticCodes.includes(line.code)
  );

  // If both present on same day, might indicate miscoding
  if (preventiveLines.length > 0 && diagnosticLines.length > 0) {
    const sameDayBoth = preventiveLines.some(prev =>
      diagnosticLines.some(diag => prev.dos === diag.dos)
    );

    if (sameDayBoth) {
      detections.push({
        ruleKey: 'preventive_vs_diagnostic',
        severity: 'warn',
        explanation: 'Both preventive and diagnostic E&M codes on same day may indicate incorrect coding',
        evidence: {
          lineRefs: [...preventiveLines.map(l => l.lineId), ...diagnosticLines.map(l => l.lineId)]
        },
        citations: [{
          title: 'Medicare Preventive Services',
          authority: 'CMS',
          citation: 'Medicare Claims Processing Manual Chapter 18'
        }]
      });
    }
  }

  return detections;
}

/**
 * Placeholder implementations for remaining rules (9-18)
 * These would be fully implemented in production
 */

function checkGlobalSurgery(summary: PricedSummary): Detection[] {
  // Rule 9: Global surgery period violations
  return [];
}

function checkJCodeUnitsSanity(summary: PricedSummary): Detection[] {
  // Rule 10: J-code units sanity check
  const detections: Detection[] = [];

  const jCodes = summary.lines.filter(line =>
    line.code && line.code.startsWith('J') && line.units
  );

  for (const line of jCodes) {
    if (line.units! > 100) { // Unusually high units
      detections.push({
        ruleKey: 'jcode_units_sanity',
        severity: 'warn',
        explanation: `Unusually high units (${line.units}) for J-code ${line.code}`,
        evidence: { lineRefs: [line.lineId] },
        citations: [{
          title: 'Medicare Part B Drug Billing',
          authority: 'CMS',
          citation: 'Chapter 17 - Drugs and Biologicals'
        }]
      });
    }
  }

  return detections;
}

function checkTherapyTimeUnits(summary: PricedSummary): Detection[] {
  // Rule 11: Therapy time-based units validation
  return [];
}

function checkTimelyFiling(summary: PricedSummary): Detection[] {
  // Rule 12: Timely filing violations
  return [];
}

function checkCOBNotApplied(summary: PricedSummary): Detection[] {
  // Rule 13: Coordination of benefits not applied
  return [];
}

function checkEOBZeroBilled(summary: PricedSummary): Detection[] {
  // Rule 14: EOB shows zero billed but charges present
  return [];
}

function checkMathErrors(summary: PricedSummary): Detection[] {
  // Rule 15: Mathematical errors in billing
  const detections: Detection[] = [];

  for (const line of summary.lines) {
    if (line.charge && line.allowed && line.planPaid && line.patientResp) {
      const expectedPatientResp = line.allowed - line.planPaid;
      const actualPatientResp = line.patientResp;

      if (Math.abs(expectedPatientResp - actualPatientResp) > 100) { // More than $1 difference
        detections.push({
          ruleKey: 'math_errors',
          severity: 'high',
          explanation: `Math error detected: Patient responsibility should be ${expectedPatientResp/100}, but shows ${actualPatientResp/100}`,
          evidence: { lineRefs: [line.lineId] },
          citations: [{
            title: 'Standard Billing Practices',
            authority: 'CMS',
            citation: 'Claims Processing Guidelines'
          }],
          savingsCents: Math.abs(expectedPatientResp - actualPatientResp)
        });
      }
    }
  }

  return detections;
}

function checkObservationVsInpatient(summary: PricedSummary): Detection[] {
  // Rule 16: Observation vs inpatient status issues
  return [];
}

function checkNonProviderFees(summary: PricedSummary): Detection[] {
  // Rule 17: Non-provider fees (processing, administrative)
  return [];
}

function checkMissingItemizedBill(summary: PricedSummary): Detection[] {
  // Rule 18: Missing itemized bill components
  const detections: Detection[] = [];

  if (summary.lines.length === 0) {
    detections.push({
      ruleKey: 'missing_itemized_bill',
      severity: 'high',
      explanation: 'No itemized charges detected. Request detailed itemized bill for proper analysis.',
      evidence: {},
      citations: [{
        title: 'Patient Right to Itemized Bill',
        authority: 'Federal',
        citation: 'Hospital Price Transparency Rule'
      }]
    });
  }

  return detections;
}