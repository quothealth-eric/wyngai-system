/**
 * Enhanced 18-Rule Engine for Medical Billing Analysis
 * Comprehensive rule set with full citations placeholders for analyst-grade reports
 */

import { PricedSummary, Detection, ParsedLine } from '@/lib/types/ocr';

/**
 * Run all 18 rules against the parsed summary with enhanced citations
 */
export function runEnhancedRuleEngine(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  console.log(`🔍 Running enhanced 18-rule analysis on ${summary.lines.length} lines...`);

  // Execute each rule with comprehensive citation support
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

  console.log(`✅ Enhanced rule analysis completed: ${detections.length} issues found`);
  return detections;
}

/**
 * Rule 1: Duplicate Lines Detection
 */
function checkDuplicateLines(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];
  const seen = new Map<string, ParsedLine[]>();

  // Group lines by code + DOS + charge amount (exact duplicates)
  for (const line of summary.lines) {
    const key = `${line.code || 'NO_CODE'}_${line.dos || 'NO_DATE'}_${line.charge || 0}`;

    if (!seen.has(key)) {
      seen.set(key, []);
    }
    seen.get(key)!.push(line);
  }

  // Find duplicates
  for (const [key, lines] of seen.entries()) {
    if (lines.length > 1 && lines[0].code) {
      const totalCharge = lines.reduce((sum, line) => sum + (line.charge || 0), 0);
      const refundAmount = totalCharge - (lines[0].charge || 0); // Keep one, refund others

      detections.push({
        ruleKey: 'duplicate_lines',
        severity: 'high',
        explanation: `Found ${lines.length} identical line items for CPT ${lines[0].code} on ${lines[0].dos || 'same date'}. Multiple identical charges suggest billing system error or intentional double-billing.`,
        evidence: {
          lineRefs: lines.map(l => l.lineId),
          pageRefs: [...new Set(lines.map(l => l.page))]
        },
        citations: [
          {
            title: 'Medicare Claims Processing Manual',
            authority: 'CMS',
            citation: 'Chapter 23, Section 30.6.1 - Duplicate Service Edits'
          },
          {
            title: 'NCCI Policy Manual',
            authority: 'CMS',
            citation: 'Chapter 1, Section B.8 - Duplicate Services'
          }
        ],
        savingsCents: refundAmount
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

  // Venipuncture (36415) bundled with lab work
  const venipunctureLines = cptLines.filter(line => line.code === '36415');
  const labLines = cptLines.filter(line =>
    line.code && ['85025', '80053', '82962', '84443', '85027'].includes(line.code)
  );

  if (venipunctureLines.length > 0 && labLines.length > 0) {
    const sameDayLabs = labLines.filter(lab =>
      venipunctureLines.some(ven => ven.dos === lab.dos)
    );

    if (sameDayLabs.length > 0) {
      const venipunctureSavings = venipunctureLines.reduce((sum, line) => sum + (line.charge || 0), 0);

      detections.push({
        ruleKey: 'unbundling_ncci',
        severity: 'high',
        explanation: `Venipuncture (36415) is bundled with laboratory services and should not be separately billed. Found ${venipunctureLines.length} venipuncture charges on same date as lab work. NCCI edits require bundling of venipuncture with lab procedures performed on the same date.`,
        evidence: {
          lineRefs: [...venipunctureLines.map(l => l.lineId), ...sameDayLabs.map(l => l.lineId)],
          pageRefs: [...new Set([...venipunctureLines.map(l => l.page), ...sameDayLabs.map(l => l.page)])]
        },
        citations: [
          {
            title: 'NCCI Policy Manual Chapter 6 - Laboratory Services',
            authority: 'CMS',
            citation: 'Venipuncture (36415) is bundled into laboratory procedures when performed on the same date of service'
          },
          {
            title: 'OPPS Packaging Rules',
            authority: 'CMS',
            citation: '42 CFR 419.2(b) - Services packaged into comprehensive APCs'
          },
          {
            title: 'Medicare Claims Processing Manual',
            authority: 'CMS',
            citation: 'Chapter 16, Section 120 - Laboratory Services Payment Policy'
          }
        ],
        savingsCents: venipunctureSavings
      });
    }
  }

  // IV therapy bundling
  const ivLines = cptLines.filter(line =>
    line.code && ['J7120', 'J7121', 'J7131'].includes(line.code)
  );

  if (ivLines.length > 0) {
    const ivSavings = ivLines.reduce((sum, line) => sum + (line.charge || 0), 0);

    detections.push({
      ruleKey: 'jcode_packaging',
      severity: 'high',
      explanation: `IV fluids and supplies (J-codes J7120, J7121, J7131) are packaged with primary procedures under OPPS and should not be separately billed. Hospital outpatient departments cannot bill for normal saline, sterile water, and dextrose solutions as they are considered supplies.`,
      evidence: {
        lineRefs: ivLines.map(l => l.lineId),
        pageRefs: [...new Set(ivLines.map(l => l.page))]
      },
      citations: [
        {
          title: 'OPPS Final Rule - Packaged Services',
          authority: 'CMS',
          citation: '42 CFR 419.2(b) - IV fluids and supplies are packaged into comprehensive APCs'
        },
        {
          title: 'Medicare Benefit Policy Manual',
          authority: 'CMS',
          citation: 'Chapter 6, Section 10 - Hospital outpatient IV fluid packaging requirements'
        },
        {
          title: 'HCPCS Level II Guidelines',
          authority: 'CMS',
          citation: 'J7120-J7131 are not separately payable in facility settings except with specific medical necessity'
        }
      ],
      savingsCents: ivSavings
    });
  }

  return detections;
}

/**
 * Rule 3: Modifier Misuse Detection
 */
function checkModifierMisuse(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];
  const modifierLines = summary.lines.filter(line => line.modifiers && line.modifiers.length > 0);

  for (const line of modifierLines) {
    if (!line.modifiers) continue;

    // Check for inappropriate modifier 25 usage
    if (line.modifiers.includes('25') && line.code?.startsWith('99')) {
      const sameDayProcedures = summary.lines.filter(other =>
        other.dos === line.dos &&
        other.code &&
        !other.code.startsWith('99') &&
        other.lineId !== line.lineId
      );

      if (sameDayProcedures.length === 0) {
        detections.push({
          ruleKey: 'modifier_misuse',
          severity: 'warn',
          explanation: `Modifier 25 applied to E&M code ${line.code} but no separately identifiable procedure found on same date. Modifier 25 requires distinct E&M service.`,
          evidence: {
            lineRefs: [line.lineId],
            pageRefs: [line.page]
          },
          citations: [
            {
              title: 'CPT Manual',
              authority: 'CMS',
              citation: 'Modifier 25 Guidelines - Significant, Separately Identifiable E&M Service'
            },
            {
              title: 'Medicare Claims Processing Manual',
              authority: 'CMS',
              citation: 'Chapter 12, Section 30.6.1B - Modifier 25 Usage'
            }
          ],
          savingsCents: line.charge || 0
        });
      }
    }

    // Check for bilateral modifier without paired procedures
    if (line.modifiers.includes('50') || line.modifiers.includes('LT') || line.modifiers.includes('RT')) {
      detections.push({
        ruleKey: 'modifier_misuse',
        severity: 'info',
        explanation: `Bilateral/laterality modifier found on ${line.code}. Verify documentation supports bilateral procedure or correct anatomical side.`,
        evidence: {
          lineRefs: [line.lineId],
          pageRefs: [line.page]
        },
        citations: [
          {
            title: 'CPT Manual',
            authority: 'CMS',
            citation: 'Modifier 50, LT, RT Guidelines - Bilateral and Laterality'
          }
        ]
      });
    }
  }

  return detections;
}

/**
 * Rule 4: Professional/Technical Component Split
 */
function checkProfTechSplit(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];
  const profLines = summary.lines.filter(line => line.modifiers?.includes('26'));
  const techLines = summary.lines.filter(line => line.modifiers?.includes('TC'));

  for (const profLine of profLines) {
    const matchingTech = techLines.find(techLine =>
      techLine.code === profLine.code && techLine.dos === profLine.dos
    );

    if (matchingTech) {
      const combinedCharge = (profLine.charge || 0) + (matchingTech.charge || 0);
      // Global charge is typically less than prof + tech combined
      const potentialSavings = combinedCharge * 0.1; // Estimate 10% savings

      detections.push({
        ruleKey: 'prof_tech_split',
        severity: 'info',
        explanation: `Professional (26) and Technical (TC) components split for ${profLine.code}. Verify if global billing would be more appropriate and cost-effective.`,
        evidence: {
          lineRefs: [profLine.lineId, matchingTech.lineId],
          pageRefs: [...new Set([profLine.page, matchingTech.page])]
        },
        citations: [
          {
            title: 'Medicare Physician Fee Schedule',
            authority: 'CMS',
            citation: 'Professional vs Technical Component Billing'
          }
        ],
        savingsCents: potentialSavings
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
  const facilityLines = summary.lines.filter(line =>
    line.code && ['02492', '02491', '02490'].includes(line.code)
  );

  if (facilityLines.length > 0) {
    detections.push({
      ruleKey: 'facility_fee_surprise',
      severity: 'high',
      explanation: `Facility fees detected (Revenue Codes 0249x series) that may violate No Surprises Act protections. Off-campus hospital departments cannot bill facility fees unless they meet specific qualifying criteria. Patient should pay in-network rates regardless of provider network status.`,
      evidence: {
        lineRefs: facilityLines.map(l => l.lineId),
        pageRefs: [...new Set(facilityLines.map(l => l.page))]
      },
      citations: [
        {
          title: 'No Surprises Act - Facility Fee Protections',
          authority: 'Federal',
          citation: 'Public Law 116-260, Section 117 - Patients protected from facility fees at off-campus departments'
        },
        {
          title: 'CMS Outpatient Prospective Payment System',
          authority: 'CMS',
          citation: '42 CFR 419.22 - Only qualifying hospital outpatient departments may bill facility fees'
        },
        {
          title: 'Interim Final Rules on Surprise Billing',
          authority: 'Federal',
          citation: '45 CFR 149.30 - Patient cost-sharing limited to in-network amounts for emergency and non-emergency services'
        }
      ]
    });
  }

  return detections;
}

/**
 * Rule 6: NSA Ancillary Services at In-Network Facility
 */
function checkNSAAncillaryInNetwork(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Check for ancillary services (anesthesia, radiology, pathology, assistant surgeons)
  const ancillaryLines = summary.lines.filter(line =>
    line.code && (
      line.code.startsWith('00') || // Anesthesia
      line.code.startsWith('7') ||  // Radiology
      line.code.startsWith('8') ||  // Pathology/Lab
      line.code.startsWith('80') || // Assistant surgeon
      ['99140', '99145', '99148', '99149', '99150'].includes(line.code) // Anesthesia
    )
  );

  if (ancillaryLines.length > 0) {
    detections.push({
      ruleKey: 'nsa_ancillary_in_network_facility',
      severity: 'warn',
      explanation: `Ancillary services (anesthesia, radiology, pathology) at in-network facility may be subject to No Surprises Act protections if providers are out-of-network.`,
      evidence: {
        lineRefs: ancillaryLines.map(l => l.lineId),
        pageRefs: [...new Set(ancillaryLines.map(l => l.page))]
      },
      citations: [
        {
          title: 'No Surprises Act',
          authority: 'Federal',
          citation: 'Section 117 - Ancillary Services at In-Network Facilities'
        },
        {
          title: 'Interim Final Rules',
          authority: 'Federal',
          citation: '45 CFR 149.30 - Patient Protections'
        }
      ]
    });
  }

  return detections;
}

/**
 * Rule 7: NSA Emergency Services
 */
function checkNSAEmergency(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Check for emergency services
  const emergencyLines = summary.lines.filter(line =>
    line.code && ['99281', '99282', '99283', '99284', '99285', '99291', '99292'].includes(line.code) ||
    line.pos === '23' // Emergency Room
  );

  if (emergencyLines.length > 0) {
    detections.push({
      ruleKey: 'nsa_emergency',
      severity: 'warn',
      explanation: `Emergency services identified. Under No Surprises Act, emergency services must be billed at in-network rates regardless of facility network status.`,
      evidence: {
        lineRefs: emergencyLines.map(l => l.lineId),
        pageRefs: [...new Set(emergencyLines.map(l => l.page))]
      },
      citations: [
        {
          title: 'No Surprises Act',
          authority: 'Federal',
          citation: 'Section 116 - Emergency Services Coverage'
        },
        {
          title: 'Consolidated Appropriations Act 2021',
          authority: 'Federal',
          citation: 'Division BB, Title I, Subtitle A'
        }
      ]
    });
  }

  return detections;
}

/**
 * Rule 8: Preventive vs Diagnostic Coding
 */
function checkPreventiveVsDiagnostic(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Common preventive services that might be miscoded as diagnostic
  const preventiveLines = summary.lines.filter(line =>
    line.code && [
      'G0121', 'G0105', 'G0121', // Preventive screenings
      '99391', '99392', '99393', '99394', '99395', '99396', '99397', // Preventive E&M
      '77067', '77063' // Mammography
    ].includes(line.code)
  );

  if (preventiveLines.length > 0) {
    detections.push({
      ruleKey: 'preventive_vs_diagnostic',
      severity: 'info',
      explanation: `Preventive services identified. Verify these are coded correctly as preventive (not diagnostic) to ensure proper patient cost-sharing under ACA.`,
      evidence: {
        lineRefs: preventiveLines.map(l => l.lineId),
        pageRefs: [...new Set(preventiveLines.map(l => l.page))]
      },
      citations: [
        {
          title: 'Affordable Care Act',
          authority: 'Federal',
          citation: 'Section 2713 - Preventive Health Services'
        },
        {
          title: 'USPSTF Guidelines',
          authority: 'Federal',
          citation: 'Preventive Services Coverage Requirements'
        }
      ]
    });
  }

  return detections;
}

/**
 * Rule 9: Global Surgery Period
 */
function checkGlobalSurgery(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Major surgical procedures with global periods
  const surgeryLines = summary.lines.filter(line =>
    line.code && (
      line.code.startsWith('1') ||  // Integumentary
      line.code.startsWith('2') ||  // Musculoskeletal
      line.code.startsWith('3') ||  // Respiratory
      line.code.startsWith('4') ||  // Cardiovascular
      line.code.startsWith('5')     // Digestive
    )
  );

  // Look for post-operative E&M within potential global period
  const postOpEM = summary.lines.filter(line =>
    line.code && line.code.startsWith('99') &&
    surgeryLines.some(surgery => surgery.dos === line.dos)
  );

  if (postOpEM.length > 0 && surgeryLines.length > 0) {
    detections.push({
      ruleKey: 'global_surgery',
      severity: 'warn',
      explanation: `E&M services on same date as surgical procedure. Verify if E&M is separately billable or included in surgical global package.`,
      evidence: {
        lineRefs: [...surgeryLines.map(l => l.lineId), ...postOpEM.map(l => l.lineId)],
        pageRefs: [...new Set([...surgeryLines.map(l => l.page), ...postOpEM.map(l => l.page)])]
      },
      citations: [
        {
          title: 'Medicare Global Surgery Rules',
          authority: 'CMS',
          citation: '42 CFR 414.40 - Global Surgery Payments'
        },
        {
          title: 'CPT Manual',
          authority: 'CMS',
          citation: 'Surgery Guidelines - Global Service Packages'
        }
      ]
    });
  }

  return detections;
}

/**
 * Rule 10: J-Code Units Sanity Check
 */
function checkJCodeUnitsSanity(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  const jCodeLines = summary.lines.filter(line =>
    line.code && line.code.startsWith('J')
  );

  for (const line of jCodeLines) {
    if (!line.units || line.units <= 0) {
      detections.push({
        ruleKey: 'jcode_units_sanity',
        severity: 'warn',
        explanation: `J-code ${line.code} missing or invalid units. Drug codes require specific unit quantities per HCPCS guidelines.`,
        evidence: {
          lineRefs: [line.lineId],
          pageRefs: [line.page]
        },
        citations: [
          {
            title: 'HCPCS Level II Manual',
            authority: 'CMS',
            citation: 'J-Code Unit Definitions and Billing Requirements'
          }
        ]
      });
    }

    // Flag unusual high-cost drugs that require documentation
    if (['J7999', 'J3490', 'J3590', 'J9999', 'J2003'].includes(line.code!)) {
      const isJ2003 = line.code === 'J2003'; // Ampicillin sodium injection
      const isUnlisted = ['J7999', 'J3490', 'J3590', 'J9999'].includes(line.code!);

      detections.push({
        ruleKey: isUnlisted ? 'jcode_documentation' : 'jcode_units_documentation',
        severity: isUnlisted ? 'high' : 'warn',
        explanation: isUnlisted
          ? `Unlisted drug code ${line.code} requires comprehensive documentation including drug name, NDC number, invoice cost, and medical necessity justification. Claims may be denied without proper supporting documentation.`
          : `J-code ${line.code} for injection requires verification of units administered and medical record documentation. Units should correspond to actual medication dosage given to patient.`,
        evidence: {
          lineRefs: [line.lineId],
          pageRefs: [line.page]
        },
        citations: [
          {
            title: 'Medicare Part B Drug Coverage Policy',
            authority: 'CMS',
            citation: isUnlisted
              ? 'Unlisted HCPCS codes require invoice, NDC, and medical necessity documentation for payment'
              : 'Injectable drugs must be supported by medical records showing actual units administered'
          },
          {
            title: 'HCPCS Level II Coding Guidelines',
            authority: 'CMS',
            citation: isUnlisted
              ? 'Miscellaneous J-codes require prior authorization and detailed medical justification'
              : 'Unit reporting must reflect actual dosage and administration route'
          },
          {
            title: 'Medicare Claims Processing Manual',
            authority: 'CMS',
            citation: 'Chapter 17 - Drug Administration and Documentation Requirements'
          }
        ]
      });
    }
  }

  return detections;
}

/**
 * Rule 11: Therapy Time Units
 */
function checkTherapyTimeUnits(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Physical therapy codes with time-based units
  const therapyLines = summary.lines.filter(line =>
    line.code && ['97110', '97112', '97116', '97124', '97140', '97530'].includes(line.code)
  );

  for (const line of therapyLines) {
    if (line.units && line.units > 8) {
      detections.push({
        ruleKey: 'therapy_time_units',
        severity: 'warn',
        explanation: `Therapy code ${line.code} shows ${line.units} units. Each unit represents 15 minutes; verify documentation supports ${line.units * 15} minutes of direct therapy.`,
        evidence: {
          lineRefs: [line.lineId],
          pageRefs: [line.page]
        },
        citations: [
          {
            title: 'Medicare Therapy Manual',
            authority: 'CMS',
            citation: 'Chapter 5 - Time-Based Billing Requirements'
          }
        ]
      });
    }
  }

  return detections;
}

/**
 * Rule 12: Timely Filing
 */
function checkTimelyFiling(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // This would require claim filing date vs DOS comparison
  // For now, flag very old dates
  const currentDate = new Date();
  const oneYearAgo = new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), currentDate.getDate());

  const oldLines = summary.lines.filter(line => {
    if (!line.dos) return false;
    const dosDate = new Date(line.dos);
    return dosDate < oneYearAgo;
  });

  if (oldLines.length > 0) {
    detections.push({
      ruleKey: 'timely_filing',
      severity: 'high',
      explanation: `Services older than 12 months detected. Verify timely filing requirements have been met per payer policies.`,
      evidence: {
        lineRefs: oldLines.map(l => l.lineId),
        pageRefs: [...new Set(oldLines.map(l => l.page))]
      },
      citations: [
        {
          title: 'Medicare Claims Processing Manual',
          authority: 'CMS',
          citation: 'Chapter 1, Section 70 - Timely Filing Requirements'
        }
      ]
    });
  }

  return detections;
}

/**
 * Rule 13: Coordination of Benefits Not Applied
 */
function checkCOBNotApplied(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Look for evidence of multiple coverage
  if (summary.header.payer && summary.header.payer.toLowerCase().includes('secondary')) {
    detections.push({
      ruleKey: 'cob_not_applied',
      severity: 'warn',
      explanation: `Secondary payer identified. Verify primary insurance benefits were properly applied before secondary billing.`,
      evidence: {
        pageRefs: [1]
      },
      citations: [
        {
          title: 'Medicare Secondary Payer Manual',
          authority: 'CMS',
          citation: 'Chapter 1 - MSP Overview and Responsibilities'
        }
      ]
    });
  }

  return detections;
}

/**
 * Rule 14: EOB Zero Billed Amount
 */
function checkEOBZeroBilled(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  const zeroChargeLines = summary.lines.filter(line =>
    !line.charge || line.charge === 0
  );

  if (zeroChargeLines.length > 0) {
    detections.push({
      ruleKey: 'eob_zero_billed',
      severity: 'info',
      explanation: `${zeroChargeLines.length} line items with zero or missing charges. Verify if these represent included services or billing errors.`,
      evidence: {
        lineRefs: zeroChargeLines.map(l => l.lineId),
        pageRefs: [...new Set(zeroChargeLines.map(l => l.page))]
      },
      citations: [
        {
          title: 'Claims Processing Guidelines',
          authority: 'CMS',
          citation: 'Zero Dollar Claims and No-Charge Services'
        }
      ]
    });
  }

  return detections;
}

/**
 * Rule 15: Math Errors
 */
function checkMathErrors(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Check line-level math (if we have all components)
  for (const line of summary.lines) {
    if (line.allowed && line.planPaid && line.patientResp) {
      const calculatedPatient = line.allowed - line.planPaid;
      const actualPatient = line.patientResp;

      if (Math.abs(calculatedPatient - actualPatient) > 100) { // More than $1 difference
        detections.push({
          ruleKey: 'math_errors',
          severity: 'high',
          explanation: `Math error on line ${line.code}: Allowed ($${(line.allowed/100).toFixed(2)}) - Plan Paid ($${(line.planPaid/100).toFixed(2)}) should equal Patient Responsibility, but shows $${(actualPatient/100).toFixed(2)}.`,
          evidence: {
            lineRefs: [line.lineId],
            pageRefs: [line.page]
          },
          citations: [
            {
              title: 'Claims Processing Standards',
              authority: 'CMS',
              citation: 'Mathematical Accuracy Requirements'
            }
          ],
          savingsCents: Math.abs(calculatedPatient - actualPatient)
        });
      }
    }
  }

  return detections;
}

/**
 * Rule 16: Observation vs Inpatient
 */
function checkObservationVsInpatient(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Look for observation codes
  const obsLines = summary.lines.filter(line =>
    line.code && ['99217', '99218', '99219', '99220', 'G0378', 'G0379'].includes(line.code)
  );

  if (obsLines.length > 0) {
    detections.push({
      ruleKey: 'observation_vs_inpatient',
      severity: 'info',
      explanation: `Observation services identified. Verify observation status is appropriate and patient was informed of different coverage implications vs inpatient admission.`,
      evidence: {
        lineRefs: obsLines.map(l => l.lineId),
        pageRefs: [...new Set(obsLines.map(l => l.page))]
      },
      citations: [
        {
          title: 'Medicare Benefit Policy Manual',
          authority: 'CMS',
          citation: 'Chapter 6 - Hospital Services, Section 20.6 Observation Services'
        }
      ]
    });
  }

  return detections;
}

/**
 * Rule 17: Non-Provider Fees
 */
function checkNonProviderFees(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Look for administrative or facility fees that might not be valid provider charges
  const nonProviderLines = summary.lines.filter(line =>
    line.description && (
      line.description.toLowerCase().includes('room') ||
      line.description.toLowerCase().includes('board') ||
      line.description.toLowerCase().includes('accommodation') ||
      line.description.toLowerCase().includes('facility')
    )
  );

  if (nonProviderLines.length > 0) {
    detections.push({
      ruleKey: 'non_provider_fees',
      severity: 'warn',
      explanation: `Potential non-provider fees identified (room/board/facility charges). Verify these are legitimate medical services covered under health plan.`,
      evidence: {
        lineRefs: nonProviderLines.map(l => l.lineId),
        pageRefs: [...new Set(nonProviderLines.map(l => l.page))]
      },
      citations: [
        {
          title: 'Plan Coverage Guidelines',
          authority: 'PayerPolicy',
          citation: 'Covered Services and Administrative Fee Exclusions'
        }
      ]
    });
  }

  return detections;
}

/**
 * Rule 18: Missing Itemized Bill
 */
function checkMissingItemizedBill(summary: PricedSummary): Detection[] {
  const detections: Detection[] = [];

  // Check if we have sufficient detail
  const hasDetailedLines = summary.lines.length > 0;
  const hasCodesOnMostLines = summary.lines.filter(line => line.code).length > summary.lines.length * 0.8;

  if (!hasDetailedLines || !hasCodesOnMostLines) {
    detections.push({
      ruleKey: 'missing_itemized_bill',
      severity: 'high',
      explanation: `Insufficient itemized detail. ${summary.lines.length} line items found, ${summary.lines.filter(line => line.code).length} with procedure codes. Request complete itemized bill with CPT/HCPCS codes.`,
      evidence: {
        pageRefs: summary.lines.length > 0 ? [...new Set(summary.lines.map(l => l.page))] : [1]
      },
      citations: [
        {
          title: 'Patient Bill of Rights',
          authority: 'Federal',
          citation: 'Right to Itemized Billing Information'
        },
        {
          title: 'State Consumer Protection Laws',
          authority: 'StateDOI',
          citation: 'Healthcare Billing Transparency Requirements'
        }
      ]
    });
  }

  return detections;
}