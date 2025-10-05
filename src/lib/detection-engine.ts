import { Detection, DocumentStructure, BenefitsContext, DetectionRule, LineItem, PolicyCitation, MoneyCents } from '@/types/analyzer';

export class DetectionEngine {
  private rules: DetectionRule[] = [];

  constructor() {
    this.initializeStaticRules();
  }

  public runDetections(structure: DocumentStructure, benefits?: BenefitsContext): Detection[] {
    const detections: Detection[] = [];

    for (const rule of this.rules) {
      if (rule.requiresBenefits && !benefits) continue;

      try {
        const detection = rule.check(structure, benefits);
        if (detection) {
          detections.push(detection);
        }
      } catch (error) {
        console.error(`Detection rule ${rule.id} failed:`, error);
      }
    }

    return detections;
  }

  private initializeStaticRules(): void {
    this.rules = [
      this.createDuplicateLineRule(),
      this.createUnbundlingRule(),
      this.createModifierMisuseRule(),
      this.createProfTechSplitRule(),
      this.createFacilityFeeRule(),
      this.createNSAAncillaryRule(),
      this.createNSAEmergencyRule(),
      this.createPreventiveRule(),
      this.createGlobalSurgeryRule(),
      this.createDrugUnitsRule(),
      this.createTherapyUnitsRule(),
      this.createTimelyFilingRule(),
      this.createCOBRule(),
      this.createMathErrorRule(),
      this.createEOBZeroStillBilledRule(),
      this.createNonProviderFeeRule(),
      this.createObsVsInpatientRule(),
      this.createMissingItemizedRule(),
      this.createGroundAmbulanceRule()
    ];
  }

  private createDuplicateLineRule(): DetectionRule {
    return {
      id: 'duplicate_lines',
      name: 'Duplicate Line Items',
      category: 'Duplicate',
      severity: 'high',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const lineItems = structure.lineItems;
        const duplicates: { [key: string]: LineItem[] } = {};

        // Group by code + DOS + units
        for (const item of lineItems) {
          if (!item.code?.value) continue;

          const key = `${item.code.value}_${item.dos || 'unknown'}_${item.units || 1}`;
          if (!duplicates[key]) duplicates[key] = [];
          duplicates[key].push(item);
        }

        const duplicateGroups = Object.entries(duplicates).filter(([, items]) => items.length > 1);

        if (duplicateGroups.length > 0) {
          const evidence = duplicateGroups.map(([key, items]) =>
            `${items[0].code?.value} (${items.length} times)`
          );

          return {
            detectionId: 'dup_001',
            category: 'Duplicate',
            severity: 'high',
            explanation: `Found ${duplicateGroups.length} potential duplicate charges. Same procedure codes charged multiple times on the same date with identical units.`,
            evidence: {
              lineRefs: duplicateGroups.flatMap(([, items]) => items.map(i => i.lineId)),
              snippets: evidence
            },
            suggestedQuestions: [
              'Were these procedures actually performed multiple times?',
              'Could this be a billing system error?',
              'Are there different providers involved that justify separate charges?'
            ],
            policyCitations: [{
              title: 'CMS Claims Integrity - Duplicate Prevention',
              citation: 'cms-ncci-duplicate-edit-guidelines',
              authority: 'CMS'
            }]
          };
        }

        return null;
      }
    };
  }

  private createUnbundlingRule(): DetectionRule {
    return {
      id: 'unbundling_ncci',
      name: 'NCCI Unbundling Detection',
      category: 'Unbundling',
      severity: 'high',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const lineItems = structure.lineItems;
        const cptCodes = lineItems
          .filter(item => item.code?.system === 'CPT')
          .map(item => item.code!.value);

        // Common bundling pairs (subset for demonstration)
        const bundlingPairs = [
          { primary: '11042', bundled: '97597', description: 'Debridement with wound care' },
          { primary: '45378', bundled: '45380', description: 'Colonoscopy with biopsy' },
          { primary: '10060', bundled: '10061', description: 'Incision and drainage procedures' }
        ];

        const violations: string[] = [];

        for (const pair of bundlingPairs) {
          if (cptCodes.includes(pair.primary) && cptCodes.includes(pair.bundled)) {
            const primaryItem = lineItems.find(item => item.code?.value === pair.primary);
            const bundledItem = lineItems.find(item => item.code?.value === pair.bundled);

            // Check if modifier 59 or 25 is present to justify separate billing
            const hasUnbundlingModifier = bundledItem?.modifiers?.some(mod =>
              ['59', '25', 'XE', 'XS', 'XP', 'XU'].includes(mod)
            );

            if (!hasUnbundlingModifier) {
              violations.push(`${pair.primary} + ${pair.bundled}: ${pair.description}`);
            }
          }
        }

        if (violations.length > 0) {
          return {
            detectionId: 'unbundle_001',
            category: 'Unbundling',
            severity: 'high',
            explanation: `Detected ${violations.length} potential unbundling violations. Procedures that should typically be billed together are being charged separately without appropriate modifiers.`,
            evidence: {
              snippets: violations
            },
            suggestedQuestions: [
              'Were these procedures performed at different times or locations?',
              'Is there medical necessity documentation for separate billing?',
              'Should modifier 59 or 25 have been applied?'
            ],
            policyCitations: [{
              title: 'CMS NCCI Policy Manual - Procedure-to-Procedure Edits',
              citation: 'cms-ncci-ptp-edit-policy',
              authority: 'CMS'
            }]
          };
        }

        return null;
      }
    };
  }

  private createModifierMisuseRule(): DetectionRule {
    return {
      id: 'modifier_misuse',
      name: 'Modifier Misuse Detection',
      category: 'Modifier',
      severity: 'warn',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const issues: string[] = [];

        for (const item of structure.lineItems) {
          if (!item.modifiers || item.modifiers.length === 0) continue;

          // Check for conflicting modifiers
          if (item.modifiers.includes('26') && item.modifiers.includes('TC')) {
            issues.push(`${item.code?.value}: Cannot use both 26 (Professional) and TC (Technical) modifiers`);
          }

          // Check for duplicate modifiers
          const uniqueModifiers = new Set(item.modifiers);
          if (uniqueModifiers.size !== item.modifiers.length) {
            issues.push(`${item.code?.value}: Contains duplicate modifiers`);
          }

          // Check for inappropriate modifier 25 usage
          if (item.modifiers.includes('25') && !item.code?.value.startsWith('99')) {
            issues.push(`${item.code?.value}: Modifier 25 typically only applies to E/M codes`);
          }
        }

        if (issues.length > 0) {
          return {
            detectionId: 'mod_001',
            category: 'Modifier',
            severity: 'warn',
            explanation: `Found ${issues.length} modifier usage issues that may indicate coding errors.`,
            evidence: { snippets: issues },
            suggestedQuestions: [
              'Are the modifiers clinically appropriate for the procedures performed?',
              'Is there documentation supporting the use of these modifiers?'
            ],
            policyCitations: [{
              title: 'CPT Modifier Guidelines',
              citation: 'ama-cpt-modifier-guidelines',
              authority: 'CMS'
            }]
          };
        }

        return null;
      }
    };
  }

  private createProfTechSplitRule(): DetectionRule {
    return {
      id: 'prof_tech_split',
      name: 'Professional/Technical Component Mismatch',
      category: 'ProfTechSplit',
      severity: 'warn',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const radiologyRanges = [
          [70000, 79999], // Diagnostic Radiology
          [80000, 89999]  // Pathology and Laboratory
        ];

        const issues: string[] = [];

        for (const item of structure.lineItems) {
          if (!item.code?.value || item.code.system !== 'CPT') continue;

          const cptCode = parseInt(item.code.value);
          const isRadPath = radiologyRanges.some(([start, end]) => cptCode >= start && cptCode <= end);

          if (isRadPath) {
            const hasProfModifier = item.modifiers?.includes('26');
            const hasTechModifier = item.modifiers?.includes('TC');

            if (!hasProfModifier && !hasTechModifier) {
              issues.push(`${item.code.value}: Radiology/Path code without 26 or TC modifier may indicate global billing`);
            }
          }
        }

        if (issues.length > 0) {
          return {
            detectionId: 'proftech_001',
            category: 'ProfTechSplit',
            severity: 'warn',
            explanation: `Found ${issues.length} radiology/pathology codes that may be missing professional/technical component modifiers.`,
            evidence: { snippets: issues },
            suggestedQuestions: [
              'Was this a global billing including both professional and technical components?',
              'Are you being charged separately for reading fees?'
            ],
            policyCitations: [{
              title: 'CMS Professional/Technical Component Billing',
              citation: 'cms-prof-tech-component-policy',
              authority: 'CMS'
            }]
          };
        }

        return null;
      }
    };
  }

  private createFacilityFeeRule(): DetectionRule {
    return {
      id: 'facility_fee_surprise',
      name: 'Facility Fee Detection',
      category: 'FacilityFee',
      severity: 'info',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const facilityIndicators = structure.lineItems.filter(item => {
          const desc = item.description?.toLowerCase() || '';
          return desc.includes('facility') ||
                 desc.includes('hospital outpatient') ||
                 item.revenueCode?.startsWith('0') || // Hospital revenue codes
                 item.pos === '22'; // Outpatient hospital
        });

        if (facilityIndicators.length > 0) {
          return {
            detectionId: 'facility_001',
            category: 'FacilityFee',
            severity: 'info',
            explanation: 'Facility fees detected. These are separate charges for using hospital facilities, in addition to physician fees.',
            evidence: {
              lineRefs: facilityIndicators.map(item => item.lineId),
              snippets: facilityIndicators.map(item => item.description || 'Facility fee')
            },
            suggestedQuestions: [
              'Were you informed about facility fees before the procedure?',
              'Could this procedure have been performed at a lower-cost setting?',
              'Are there any price transparency disclosures available?'
            ],
            policyCitations: [{
              title: 'Hospital Price Transparency Rule',
              citation: 'cms-hospital-price-transparency',
              authority: 'CMS'
            }]
          };
        }

        return null;
      }
    };
  }

  private createNSAAncillaryRule(): DetectionRule {
    return {
      id: 'nsa_ancillary',
      name: 'No Surprises Act - Ancillary Provider',
      category: 'NSA_Ancillary',
      severity: 'high',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        // Look for ancillary providers at in-network facilities
        const ancillarySpecialties = [
          'anesthesiology', 'anesthesia', 'pathology', 'radiology', 'emergency',
          'hospitalist', 'intensivist', 'assistant surgeon'
        ];

        const header = structure.header;
        const providerName = header.providerName?.toLowerCase() || '';

        const isAncillary = ancillarySpecialties.some(specialty =>
          providerName.includes(specialty)
        );

        const hasOutOfNetworkIndicators =
          header.payer?.toLowerCase().includes('out of network') ||
          structure.totals.patientResponsibility > (structure.totals.allowed || 0) * 0.5;

        if (isAncillary && hasOutOfNetworkIndicators) {
          return {
            detectionId: 'nsa_001',
            category: 'NSA_Ancillary',
            severity: 'high',
            explanation: 'Potential No Surprises Act violation. Ancillary providers at in-network facilities should not balance bill patients beyond in-network cost-sharing.',
            evidence: {
              snippets: [`Provider: ${header.providerName}`, 'Out-of-network billing detected']
            },
            suggestedQuestions: [
              'Was the facility in your insurance network?',
              'Did you receive advance notice of out-of-network providers?',
              'Were you given an opportunity to choose an in-network provider?'
            ],
            policyCitations: [{
              title: 'No Surprises Act - Facility-Based Ancillary Services',
              citation: 'nsa-facility-based-ancillary',
              authority: 'Federal'
            }]
          };
        }

        return null;
      }
    };
  }

  private createNSAEmergencyRule(): DetectionRule {
    return {
      id: 'nsa_emergency',
      name: 'No Surprises Act - Emergency Services',
      category: 'NSA_ER',
      severity: 'high',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const emergencyKeywords = [
          'emergency', 'er', 'emergency room', 'trauma', 'urgent',
          'emergency department', 'ed'
        ];

        const hasEmergencyService = structure.lineItems.some(item => {
          const desc = item.description?.toLowerCase() || '';
          return emergencyKeywords.some(keyword => desc.includes(keyword)) ||
                 item.pos === '23'; // Emergency Room
        });

        const hasHighOutOfPocketCost =
          (structure.totals.patientResponsibility || 0) > 100000; // > $1000

        if (hasEmergencyService && hasHighOutOfPocketCost) {
          return {
            detectionId: 'nsa_er_001',
            category: 'NSA_ER',
            severity: 'high',
            explanation: 'Emergency services with high out-of-network charges detected. The No Surprises Act limits your cost-sharing to in-network amounts for emergency care.',
            evidence: {
              snippets: ['Emergency services identified', `High patient cost: $${(structure.totals.patientResponsibility || 0) / 100}`]
            },
            suggestedQuestions: [
              'Was this truly emergency care that could not be delayed?',
              'Did you have a choice in where to receive care?',
              'Are you being charged more than your in-network emergency room copay/coinsurance?'
            ],
            policyCitations: [{
              title: 'No Surprises Act - Emergency Services Protection',
              citation: 'nsa-emergency-services',
              authority: 'Federal'
            }]
          };
        }

        return null;
      }
    };
  }

  private createPreventiveRule(): DetectionRule {
    return {
      id: 'preventive_mismatch',
      name: 'Preventive Services Cost-Sharing',
      category: 'Preventive',
      severity: 'high',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const preventiveKeywords = [
          'annual', 'wellness', 'screening', 'preventive', 'mammogram',
          'colonoscopy', 'physical exam', 'checkup', 'vaccine', 'immunization'
        ];

        const preventiveItems = structure.lineItems.filter(item => {
          const desc = item.description?.toLowerCase() || '';
          return preventiveKeywords.some(keyword => desc.includes(keyword));
        });

        const hasPreventiveCostSharing = preventiveItems.some(item =>
          (item.patientResp || 0) > 0
        );

        if (preventiveItems.length > 0 && hasPreventiveCostSharing) {
          return {
            detectionId: 'prev_001',
            category: 'Preventive',
            severity: 'high',
            explanation: 'Preventive services with patient charges detected. Most preventive care should be covered at 100% for in-network providers under the ACA.',
            evidence: {
              lineRefs: preventiveItems.map(item => item.lineId),
              snippets: preventiveItems.map(item => item.description || 'Preventive service')
            },
            suggestedQuestions: [
              'Was this service coded as preventive vs. diagnostic?',
              'Were additional non-preventive services performed during the same visit?',
              'Is the provider in your insurance network?'
            ],
            policyCitations: [{
              title: 'ACA Preventive Services Coverage',
              citation: 'aca-preventive-services-no-cost-sharing',
              authority: 'Federal'
            }]
          };
        }

        return null;
      }
    };
  }

  private createGlobalSurgeryRule(): DetectionRule {
    return {
      id: 'global_surgery',
      name: 'Global Surgical Package Violations',
      category: 'GlobalSurgery',
      severity: 'warn',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        // Major surgery CPT codes (simplified list)
        const majorSurgeryRanges = [
          [10000, 69999] // Surgery section
        ];

        const surgeryItems = structure.lineItems.filter(item => {
          if (!item.code?.value || item.code.system !== 'CPT') return false;
          const code = parseInt(item.code.value);
          return majorSurgeryRanges.some(([start, end]) => code >= start && code <= end);
        });

        // Look for E/M services on same date without appropriate modifiers
        const emItems = structure.lineItems.filter(item => {
          if (!item.code?.value || item.code.system !== 'CPT') return false;
          const code = parseInt(item.code.value);
          return code >= 99200 && code <= 99499; // E/M codes
        });

        const violations: string[] = [];

        for (const surgery of surgeryItems) {
          for (const em of emItems) {
            if (surgery.dos === em.dos) {
              const hasAppropriateModifier = em.modifiers?.some(mod =>
                ['24', '25', '57', '79'].includes(mod)
              );

              if (!hasAppropriateModifier) {
                violations.push(`E/M service ${em.code?.value} on same date as surgery ${surgery.code?.value} without modifier`);
              }
            }
          }
        }

        if (violations.length > 0) {
          return {
            detectionId: 'global_001',
            category: 'GlobalSurgery',
            severity: 'warn',
            explanation: `Found ${violations.length} potential global surgery package violations. Post-operative visits may be included in the surgical fee.`,
            evidence: { snippets: violations },
            suggestedQuestions: [
              'Were these services unrelated to the surgery?',
              'Was this a significant, separately identifiable service?',
              'Is this within the global period for the surgery?'
            ],
            policyCitations: [{
              title: 'CMS Global Surgery Rules',
              citation: 'cms-global-surgery-policy',
              authority: 'CMS'
            }]
          };
        }

        return null;
      }
    };
  }

  // Helper methods for remaining rules...
  private createDrugUnitsRule(): DetectionRule {
    return {
      id: 'drug_units',
      name: 'Drug Unit Validation',
      category: 'DrugUnits',
      severity: 'warn',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const jCodeItems = structure.lineItems.filter(item =>
          item.code?.system === 'HCPCS' && item.code.value.startsWith('J')
        );

        const issues: string[] = [];

        for (const item of jCodeItems) {
          if (item.units && item.units > 100) {
            issues.push(`${item.code?.value}: Unusually high units (${item.units})`);
          }

          // Check for fractional units that should be whole numbers
          if (item.units && item.units % 1 !== 0 && item.units < 1) {
            issues.push(`${item.code?.value}: Fractional units may indicate dosing error`);
          }
        }

        if (issues.length > 0) {
          return {
            detectionId: 'drug_001',
            category: 'DrugUnits',
            severity: 'warn',
            explanation: `Found ${issues.length} potential drug dosing unit issues.`,
            evidence: { snippets: issues },
            suggestedQuestions: [
              'Are the drug units consistent with the dosage administered?',
              'Is the vial size appropriate for the units billed?'
            ],
            policyCitations: [{
              title: 'HCPCS Drug Billing Units',
              citation: 'cms-hcpcs-drug-units',
              authority: 'CMS'
            }]
          };
        }

        return null;
      }
    };
  }

  private createTherapyUnitsRule(): DetectionRule {
    return {
      id: 'therapy_units',
      name: 'Therapy Time Units Validation',
      category: 'TherapyUnits',
      severity: 'warn',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        // Time-based therapy codes (15-minute units)
        const timeBasedTherapy = ['97110', '97112', '97116', '97530', '97535'];

        const issues: string[] = [];

        for (const item of structure.lineItems) {
          if (item.code?.system === 'CPT' && timeBasedTherapy.includes(item.code.value)) {
            if (item.units && item.units > 8) { // More than 2 hours
              issues.push(`${item.code.value}: Unusually high therapy units (${item.units} = ${item.units * 15} minutes)`);
            }
          }
        }

        if (issues.length > 0) {
          return {
            detectionId: 'therapy_001',
            category: 'TherapyUnits',
            severity: 'warn',
            explanation: `Found ${issues.length} therapy codes with questionable time units.`,
            evidence: { snippets: issues },
            suggestedQuestions: [
              'Do the therapy units match the actual time spent?',
              'Is there documentation supporting this duration of therapy?'
            ],
            policyCitations: [{
              title: 'CPT Therapy Time Units',
              citation: 'cpt-therapy-time-guidelines',
              authority: 'CMS'
            }]
          };
        }

        return null;
      }
    };
  }

  private createTimelyFilingRule(): DetectionRule {
    return {
      id: 'timely_filing',
      name: 'Timely Filing Issues',
      category: 'TimelyFiling',
      severity: 'warn',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const timelyFilingCodes = ['29', '109', '119'];

        const hasTimelyFilingDenial = structure.remarkCodes.some(code =>
          timelyFilingCodes.includes(code.code)
        );

        if (hasTimelyFilingDenial) {
          return {
            detectionId: 'timely_001',
            category: 'TimelyFiling',
            severity: 'warn',
            explanation: 'Claim denied for timely filing. Provider may need to write off this amount rather than billing patient.',
            evidence: {
              snippets: ['Timely filing denial detected in remark codes']
            },
            suggestedQuestions: [
              'Is the provider trying to collect from you for their filing error?',
              'What is your state\'s policy on balance billing for timely filing denials?'
            ],
            policyCitations: [{
              title: 'Timely Filing Requirements',
              citation: 'timely-filing-provider-responsibility',
              authority: 'StateDOI'
            }]
          };
        }

        return null;
      }
    };
  }

  // Continue with remaining rule implementations...
  private createCOBRule(): DetectionRule {
    return {
      id: 'coordination_benefits',
      name: 'Coordination of Benefits Issues',
      category: 'COB',
      severity: 'warn',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const cobCodes = ['15', '16', '70'];

        const hasCOBIssue = structure.remarkCodes.some(code =>
          cobCodes.includes(code.code)
        );

        if (hasCOBIssue) {
          return {
            detectionId: 'cob_001',
            category: 'COB',
            severity: 'warn',
            explanation: 'Coordination of benefits issue detected. Claim may need to be submitted to secondary insurance.',
            evidence: {
              snippets: ['COB remark codes present']
            },
            suggestedQuestions: [
              'Do you have secondary insurance coverage?',
              'Has this claim been submitted to all insurance plans?'
            ],
            policyCitations: [{
              title: 'Coordination of Benefits Standards',
              citation: 'cob-standard-practices',
              authority: 'PayerPolicy'
            }]
          };
        }

        return null;
      }
    };
  }

  private createMathErrorRule(): DetectionRule {
    return {
      id: 'math_errors',
      name: 'Mathematical Calculation Errors',
      category: 'MathError',
      severity: 'high',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const totals = structure.totals;
        const issues: string[] = [];

        // Check if patient responsibility = allowed - plan paid (basic math)
        const allowed = totals.allowed || 0;
        const planPaid = totals.planPaid || 0;
        const patientResp = totals.patientResponsibility || 0;
        const expected = allowed - planPaid;

        if (Math.abs(patientResp - expected) > 100) { // $1 tolerance in cents
          issues.push(`Patient responsibility ($${patientResp/100}) doesn't equal allowed ($${allowed/100}) minus plan paid ($${planPaid/100})`);
        }

        // Check line item totals
        const lineItemTotal = structure.lineItems.reduce((sum, item) => sum + (item.charge || 0), 0);
        const billedTotal = totals.billed || 0;

        if (Math.abs(lineItemTotal - billedTotal) > 100) {
          issues.push(`Line items total ($${lineItemTotal/100}) doesn't match billed total ($${billedTotal/100})`);
        }

        if (issues.length > 0) {
          return {
            detectionId: 'math_001',
            category: 'MathError',
            severity: 'high',
            explanation: `Found ${issues.length} mathematical errors in bill calculations.`,
            evidence: { snippets: issues },
            suggestedQuestions: [
              'Can you verify these calculations with the provider?',
              'Are there any adjustments or corrections needed?'
            ],
            policyCitations: [{
              title: 'Billing Accuracy Requirements',
              citation: 'accurate-billing-standards',
              authority: 'PayerPolicy'
            }]
          };
        }

        return null;
      }
    };
  }

  private createEOBZeroStillBilledRule(): DetectionRule {
    return {
      id: 'eob_zero_still_billed',
      name: 'EOB Shows Zero but Still Billed',
      category: 'EOBZeroStillBilled',
      severity: 'high',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const patientResp = structure.totals.patientResponsibility || 0;

        // This rule would need EOB vs Bill comparison
        // For now, check if patient responsibility is zero but other indicators suggest billing
        if (patientResp === 0 && structure.header.accountId) {
          return {
            detectionId: 'eob_zero_001',
            category: 'EOBZeroStillBilled',
            severity: 'high',
            explanation: 'EOB shows $0 patient responsibility but provider may still be attempting to collect payment.',
            evidence: {
              snippets: [`Patient responsibility: $0`, `Account ID present: ${structure.header.accountId}`]
            },
            suggestedQuestions: [
              'Does your EOB show $0 patient responsibility?',
              'Is the provider correctly posting insurance payments?'
            ],
            policyCitations: [{
              title: 'Balance Billing Restrictions',
              citation: 'provider-balance-billing-limits',
              authority: 'StateDOI'
            }]
          };
        }

        return null;
      }
    };
  }

  private createNonProviderFeeRule(): DetectionRule {
    return {
      id: 'non_provider_fees',
      name: 'Non-Provider Administrative Fees',
      category: 'NonProviderFee',
      severity: 'warn',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const adminFeeKeywords = [
          'billing fee', 'statement fee', 'processing fee', 'administrative fee',
          'convenience fee', 'payment fee', 'service charge'
        ];

        const adminFees = structure.lineItems.filter(item => {
          const desc = item.description?.toLowerCase() || '';
          return adminFeeKeywords.some(keyword => desc.includes(keyword));
        });

        if (adminFees.length > 0) {
          return {
            detectionId: 'admin_001',
            category: 'NonProviderFee',
            severity: 'warn',
            explanation: `Found ${adminFees.length} administrative fees that may be contestable.`,
            evidence: {
              lineRefs: adminFees.map(fee => fee.lineId),
              snippets: adminFees.map(fee => fee.description || 'Administrative fee')
            },
            suggestedQuestions: [
              'Are these fees disclosed in advance?',
              'What is the policy basis for these charges?',
              'Are there alternative payment methods without fees?'
            ],
            policyCitations: [{
              title: 'Fair Billing Practices',
              citation: 'administrative-fee-restrictions',
              authority: 'StateDOI'
            }]
          };
        }

        return null;
      }
    };
  }

  private createObsVsInpatientRule(): DetectionRule {
    return {
      id: 'obs_vs_inpatient',
      name: 'Observation vs Inpatient Status',
      category: 'ObsVsInpatient',
      severity: 'info',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const obsIndicators = structure.lineItems.filter(item =>
          item.revenueCode?.startsWith('076') || // Observation
          item.description?.toLowerCase().includes('observation')
        );

        const inpatientIndicators = structure.lineItems.filter(item =>
          item.revenueCode?.startsWith('01') || // Room and board
          item.description?.toLowerCase().includes('inpatient')
        );

        if (obsIndicators.length > 0 && inpatientIndicators.length > 0) {
          return {
            detectionId: 'obs_001',
            category: 'ObsVsInpatient',
            severity: 'info',
            explanation: 'Mixed observation and inpatient status billing detected. This may affect coverage and benefits.',
            evidence: {
              snippets: ['Observation charges present', 'Inpatient charges present']
            },
            suggestedQuestions: [
              'What was your official admission status?',
              'How does this affect your Medicare or insurance benefits?'
            ],
            policyCitations: [{
              title: 'Observation vs Inpatient Status Rules',
              citation: 'cms-observation-inpatient-status',
              authority: 'CMS'
            }]
          };
        }

        return null;
      }
    };
  }

  private createMissingItemizedRule(): DetectionRule {
    return {
      id: 'missing_itemized',
      name: 'Missing Itemized Details',
      category: 'MissingItemized',
      severity: 'info',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const hasDetailedItems = structure.lineItems.some(item =>
          item.code?.value && item.description && item.charge
        );

        if (!hasDetailedItems && (structure.totals.billed || 0) > 50000) { // >$500
          return {
            detectionId: 'itemized_001',
            category: 'MissingItemized',
            severity: 'info',
            explanation: 'This appears to be a summary bill. Request an itemized bill with CPT codes and detailed charges.',
            evidence: {
              snippets: ['Limited line item detail available']
            },
            suggestedQuestions: [
              'Can you provide an itemized bill with procedure codes?',
              'What specific services were provided?'
            ],
            policyCitations: [{
              title: 'Patient Right to Itemized Bills',
              citation: 'patient-itemized-bill-rights',
              authority: 'StateDOI'
            }]
          };
        }

        return null;
      }
    };
  }

  private createGroundAmbulanceRule(): DetectionRule {
    return {
      id: 'ground_ambulance',
      name: 'Ground Ambulance Balance Billing',
      category: 'GroundAmbulance',
      severity: 'warn',
      requiresBenefits: false,
      check: (structure: DocumentStructure) => {
        const ambulanceCodes = ['A0425', 'A0426', 'A0427', 'A0428', 'A0429'];

        const ambulanceItems = structure.lineItems.filter(item =>
          ambulanceCodes.includes(item.code?.value || '') ||
          item.description?.toLowerCase().includes('ambulance')
        );

        const hasHighPatientCost = (structure.totals.patientResponsibility || 0) > 50000; // >$500

        if (ambulanceItems.length > 0 && hasHighPatientCost) {
          return {
            detectionId: 'ambulance_001',
            category: 'GroundAmbulance',
            severity: 'warn',
            explanation: 'Ground ambulance service with high out-of-network charges. Limited No Surprises Act protection; check state laws.',
            evidence: {
              lineRefs: ambulanceItems.map(item => item.lineId),
              snippets: ambulanceItems.map(item => item.description || 'Ambulance service')
            },
            suggestedQuestions: [
              'Was this an emergency transport?',
              'Are there state protections for ambulance balance billing?',
              'Can you negotiate the out-of-network charges?'
            ],
            policyCitations: [{
              title: 'Ground Ambulance Billing Protections',
              citation: 'state-ambulance-balance-billing-laws',
              authority: 'StateDOI'
            }]
          };
        }

        return null;
      }
    };
  }
}