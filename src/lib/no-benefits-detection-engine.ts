import { Detection, DocumentMeta, LineItem } from '@/types/analyzer';
import { PolicyCitation, MoneyCents } from '@/types/common';

export interface DetectionContext {
  documents: DocumentMeta[];
  lineItems: LineItem[];
  userNarrative?: string;
}

export interface DetectionRule {
  id: string;
  name: string;
  category: Detection['category'];
  description: string;
  check: (context: DetectionContext) => Detection | null;
}

export class NoBenefitsDetectionEngine {
  private rules: DetectionRule[] = [];

  constructor() {
    this.initializeDetectionRules();
  }

  private initializeDetectionRules(): void {
    this.rules = [
      this.createDuplicatesRule(),
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
      this.createEOBZeroStillBilledRule(),
      this.createMathErrorRule(),
      this.createObservationRule(),
      this.createNonProviderFeeRule(),
      this.createMissingItemizedRule()
    ];
  }

  public runAllDetections(context: DetectionContext): Detection[] {
    const detections: Detection[] = [];

    for (const rule of this.rules) {
      try {
        const detection = rule.check(context);
        if (detection) {
          detections.push(detection);
        }
      } catch (error) {
        console.error(`Error running detection rule ${rule.id}:`, error);
      }
    }

    console.log(`🔍 Completed no-benefits detection: ${detections.length} issues found`);
    return detections;
  }

  private createDuplicatesRule(): DetectionRule {
    return {
      id: 'duplicates',
      name: 'Duplicate Line Items',
      category: 'Duplicate',
      description: 'Detect duplicate charges for the same service',
      check: (context: DetectionContext): Detection | null => {
        const duplicates: string[] = [];
        const seen = new Map<string, LineItem>();

        for (const item of context.lineItems) {
          if (!item.code || !item.code || !item.dos) continue;

          const key = `${item.code}_${item.dos}_${item.modifiers?.join(',') || ''}_${item.units || 1}`;

          if (seen.has(key)) {
            const existing = seen.get(key)!;
            if (existing.charge === item.charge) {
              duplicates.push(item.lineId);
            }
          } else {
            seen.set(key, item);
          }
        }

        if (duplicates.length === 0) return null;

        return {
          detectionId: `dup_${Date.now()}`,
          category: 'Duplicate',
          severity: 'high',
          explanation: `Found ${duplicates.length} duplicate line items with identical codes, dates, modifiers, and charges. This typically indicates billing system errors or double-entry mistakes.`,
          evidence: {
            lineRefs: duplicates,
            snippets: [`${duplicates.length} duplicate entries detected`]
          },
          suggestedQuestions: [
            'Why are there duplicate charges for the same service on the same date?',
            'Can you remove the duplicate entries and provide a corrected bill?',
            'What is your process for preventing duplicate billing?'
          ],
          policyCitations: [
            {
              title: 'Claims Integrity Standards',
              authority: 'CMS',
              citation: 'cms-claims-integrity'
            },
            {
              title: 'Accurate Billing Requirements',
              authority: 'Federal',
              citation: 'fraud-waste-abuse-prevention'
            }
          ],
        };
      }
    };
  }

  private createUnbundlingRule(): DetectionRule {
    return {
      id: 'unbundling',
      name: 'NCCI Unbundling Violations',
      category: 'Unbundling',
      description: 'Detect improperly unbundled procedures',
      check: (context: DetectionContext): Detection | null => {
        const violations: string[] = [];

        // Common NCCI edit patterns (in production, would use full NCCI database)
        const commonEdits = [
          { column1: '99213', column2: '36415', modifier: '59' }, // Office visit + venipuncture
          { column1: '99214', column2: '93000', modifier: '25' }, // Office visit + EKG
          { column1: '99232', column2: '99233', modifier: 'NONE' }, // Subsequent hospital care levels
        ];

        for (const edit of commonEdits) {
          const code1Items = context.lineItems.filter(item => item.code === edit.column1);
          const code2Items = context.lineItems.filter(item => item.code === edit.column2);

          if (code1Items.length > 0 && code2Items.length > 0) {
            // Check if they're on the same date
            for (const item1 of code1Items) {
              for (const item2 of code2Items) {
                if (item1.dos === item2.dos) {
                  // Check if proper modifier is present
                  const hasModifier = item2.modifiers?.includes(edit.modifier) ||
                                     item1.modifiers?.includes(edit.modifier);

                  if (!hasModifier && edit.modifier !== 'NONE') {
                    violations.push(`${item1.lineId}, ${item2.lineId}`);
                  }
                }
              }
            }
          }
        }

        if (violations.length === 0) return null;

        return {
          detectionId: `unbundle_${Date.now()}`,
          category: 'Unbundling',
          severity: 'high',
          explanation: 'Found procedures that are typically bundled together being billed separately without appropriate modifiers. This may violate NCCI editing rules and could result in overpayment.',
          evidence: {
            lineRefs: violations.flat(),
            snippets: [`${violations.length} potential NCCI violations`]
          },
          suggestedQuestions: [
            'Why are these bundled procedures being billed separately?',
            'What modifiers justify separate billing for these services?',
            'Can you provide documentation supporting separate payment?'
          ],
          policyCitations: [
            {
              title: 'NCCI Policy Manual',
              authority: 'CMS',
              citation: 'cms-ncci-policy-manual'
            },
            {
              title: 'Correct Coding Initiative Edits',
              authority: 'CMS',
              citation: 'cms-ncci-edit-tables'
            }
          ],
        };
      }
    };
  }

  private createModifierMisuseRule(): DetectionRule {
    return {
      id: 'modifier_misuse',
      name: 'Modifier Misuse',
      category: 'Modifier',
      description: 'Detect improper use of procedure modifiers',
      check: (context: DetectionContext): Detection | null => {
        const violations: string[] = [];

        for (const item of context.lineItems) {
          if (!item.modifiers || item.modifiers.length === 0) continue;

          // Check for conflicting modifiers on same line
          if (item.modifiers.includes('26') && item.modifiers.includes('TC')) {
            violations.push(item.lineId);
          }

          // Check for inappropriate 25 modifier usage
          if (item.modifiers.includes('25') && item.code) {
            const isEMCode = /^9921[3-5]$/.test(item.code) || /^9923[2-3]$/.test(item.code);
            if (isEMCode) {
              // Check if there's a procedure on same date to justify modifier 25
              const sameDateProcedures = context.lineItems.filter(other =>
                other.dos === item.dos &&
                other.lineId !== item.lineId &&
                other.code &&
                !/^992/.test(other.code) // Not another E/M code
              );

              if (sameDateProcedures.length === 0) {
                violations.push(item.lineId);
              }
            }
          }

          // Check for inappropriate 59 modifier usage
          if (item.modifiers.includes('59')) {
            // Modifier 59 should only be used when other specific modifiers don't apply
            const hasSpecificModifier = item.modifiers.some(mod =>
              ['XE', 'XP', 'XS', 'XU'].includes(mod)
            );
            if (hasSpecificModifier) {
              violations.push(item.lineId);
            }
          }
        }

        if (violations.length === 0) return null;

        return {
          detectionId: `modifier_${Date.now()}`,
          category: 'Modifier',
          severity: 'warn',
          explanation: 'Found inappropriate or conflicting modifier usage that may not meet coding guidelines and could result in claim denials or payment adjustments.',
          evidence: {
            lineRefs: violations,
            snippets: [`${violations.length} modifier issues detected`]
          },
          suggestedQuestions: [
            'What documentation supports the use of these modifiers?',
            'Why are conflicting modifiers applied to the same service?',
            'Can you provide coding rationale for modifier 25/59 usage?'
          ],
          policyCitations: [
            {
              title: 'CPT Modifier Guidelines',
              authority: 'CMS',
              citation: 'cms-cpt-modifier-guidance'
            },
            {
              title: 'NCCI Modifier Guidelines',
              authority: 'CMS',
              citation: 'cms-ncci-modifier-rules'
            }
          ],
        };
      }
    };
  }

  private createProfTechSplitRule(): DetectionRule {
    return {
      id: 'prof_tech_split',
      name: 'Professional/Technical Split Issues',
      category: 'ProfTechSplit',
      description: 'Detect issues with professional and technical component billing',
      check: (context: DetectionContext): Detection | null => {
        const issues: string[] = [];

        // Look for imaging/path codes that should be split
        const splitEligibleCodes = ['70010', '71010', '73000', '76700', '80053', '85025'];

        for (const item of context.lineItems) {
          if (!item.code || !splitEligibleCodes.includes(item.code)) continue;

          const hasModifier26 = item.modifiers?.includes('26');
          const hasModifierTC = item.modifiers?.includes('TC');

          // Check for same code billed both ways on same date
          const sameCodeSameDate = context.lineItems.filter(other =>
            other.code === item.code &&
            other.dos === item.dos &&
            other.lineId !== item.lineId
          );

          if (sameCodeSameDate.length > 0) {
            // Check if we have both 26 and TC or neither
            const has26 = [item, ...sameCodeSameDate].some(i => i.modifiers?.includes('26'));
            const hasTC = [item, ...sameCodeSameDate].some(i => i.modifiers?.includes('TC'));
            const hasGlobal = [item, ...sameCodeSameDate].some(i =>
              !i.modifiers?.includes('26') && !i.modifiers?.includes('TC')
            );

            if ((has26 && hasTC && hasGlobal) || (hasGlobal && (has26 || hasTC))) {
              issues.push(item.lineId);
            }
          }
        }

        if (issues.length === 0) return null;

        return {
          detectionId: `proftech_${Date.now()}`,
          category: 'ProfTechSplit',
          severity: 'warn',
          explanation: 'Found potential issues with professional and technical component billing for imaging or laboratory services. Services may be billed incorrectly as both global and split components.',
          evidence: {
            lineRefs: issues,
            snippets: [`${issues.length} professional/technical split issues`]
          },
          suggestedQuestions: [
            'Why is this service billed both as global and split components?',
            'Which facility provided the technical component?',
            'Who performed the professional interpretation?'
          ],
          policyCitations: [
            {
              title: 'Professional vs Technical Component Billing',
              authority: 'CMS',
              citation: 'cms-professional-technical-components'
            }
          ],
        };
      }
    };
  }

  private createFacilityFeeRule(): DetectionRule {
    return {
      id: 'facility_fee',
      name: 'Undisclosed Facility Fees',
      category: 'FacilityFee',
      description: 'Detect surprise facility fees',
      check: (context: DetectionContext): Detection | null => {
        const facilityFees: string[] = [];

        // Look for facility fee indicators
        for (const item of context.lineItems) {
          const description = item.description?.toLowerCase() || '';

          if (description.includes('facility') && description.includes('fee')) {
            facilityFees.push(item.lineId);
          }

          // Check for place of service indicating hospital outpatient
          if (item.pos === '22' && item.charge && item.charge > 5000) { // $50+ facility fee
            facilityFees.push(item.lineId);
          }

          // Revenue codes indicating facility charges
          if (item.revCode && ['0636', '0450', '0760'].includes(item.revCode)) {
            facilityFees.push(item.lineId);
          }
        }

        if (facilityFees.length === 0) return null;

        return {
          detectionId: `facility_${Date.now()}`,
          category: 'FacilityFee',
          severity: 'high',
          explanation: 'Found facility fees that may not have been properly disclosed. Hospital-owned clinics must disclose facility fees in advance, and these charges should be clearly explained.',
          evidence: {
            lineRefs: facilityFees,
            snippets: [`${facilityFees.length} facility fee charges`]
          },
          suggestedQuestions: [
            'Was I informed about facility fees before receiving care?',
            'Why is there a separate facility fee for this service?',
            'Can you provide the advance notice of facility fees?'
          ],
          policyCitations: [
            {
              title: 'Hospital Outpatient Billing Rules',
              authority: 'CMS',
              citation: 'cms-hospital-outpatient-billing'
            },
            {
              title: 'Facility Fee Disclosure Requirements',
              authority: 'StateDOI',
              citation: 'state-facility-fee-disclosure'
            }
          ],
        };
      }
    };
  }

  private createNSAAncillaryRule(): DetectionRule {
    return {
      id: 'nsa_ancillary',
      name: 'NSA Facility-Based Ancillary Protection',
      category: 'NSA_Ancillary',
      description: 'Detect potential No Surprises Act ancillary protections',
      check: (context: DetectionContext): Detection | null => {
        const ancillaryServices: string[] = [];

        // Look for ancillary services at facilities
        const ancillaryIndicators = [
          'anesthesia', 'radiology', 'pathology', 'emergency medicine', 'neonatology'
        ];

        for (const item of context.lineItems) {
          const description = item.description?.toLowerCase() || '';

          // Check for anesthesia codes
          if (item.code && /^0[0-9]{4}/.test(item.code)) {
            ancillaryServices.push(item.lineId);
          }

          // Check for radiology codes
          if (item.code && /^7[0-9]{4}/.test(item.code)) {
            ancillaryServices.push(item.lineId);
          }

          // Check for pathology codes
          if (item.code && /^8[0-9]{4}/.test(item.code)) {
            ancillaryServices.push(item.lineId);
          }

          // Check description for ancillary services
          for (const indicator of ancillaryIndicators) {
            if (description.includes(indicator)) {
              ancillaryServices.push(item.lineId);
              break;
            }
          }
        }

        // Check if this appears to be at an in-network facility
        const hasInNetworkIndicators = context.documents.some(doc =>
          doc.providerName?.toLowerCase().includes('hospital') ||
          doc.providerName?.toLowerCase().includes('emergency')
        );

        if (ancillaryServices.length === 0 || !hasInNetworkIndicators) return null;

        return {
          detectionId: `nsa_ancillary_${Date.now()}`,
          category: 'NSA_Ancillary',
          severity: 'high',
          explanation: 'Found ancillary services (anesthesia, radiology, pathology) that may be protected under the No Surprises Act when provided at in-network facilities. You should only pay in-network cost-sharing amounts.',
          evidence: {
            lineRefs: ancillaryServices,
            snippets: [`${ancillaryServices.length} ancillary services at facility`]
          },
          suggestedQuestions: [
            'Is this facility in my insurance network?',
            'Why am I being charged out-of-network rates for ancillary services?',
            'Should this be covered under No Surprises Act protections?'
          ],
          policyCitations: [
            {
              title: 'No Surprises Act Facility-Based Ancillary Services',
              authority: 'Federal',
              citation: 'nsa-facility-based-ancillary'
            },
            {
              title: 'Surprise Billing Protection for Ancillary Providers',
              authority: 'CMS',
              citation: 'cms-ancillary-surprise-billing'
            }
          ],
        };
      }
    };
  }

  private createNSAEmergencyRule(): DetectionRule {
    return {
      id: 'nsa_emergency',
      name: 'NSA Emergency Services Protection',
      category: 'NSA_ER',
      description: 'Detect No Surprises Act emergency protections',
      check: (context: DetectionContext): Detection | null => {
        const emergencyServices: string[] = [];

        // Look for emergency indicators
        for (const item of context.lineItems) {
          // Emergency place of service
          if (item.pos === '23') {
            emergencyServices.push(item.lineId);
          }

          // Emergency CPT codes
          if (item.code && ['99281', '99282', '99283', '99284', '99285'].includes(item.code)) {
            emergencyServices.push(item.lineId);
          }

          const description = item.description?.toLowerCase() || '';
          if (description.includes('emergency') || description.includes('er ')) {
            emergencyServices.push(item.lineId);
          }
        }

        // Check narrative for emergency indicators
        const narrative = context.userNarrative?.toLowerCase() || '';
        const hasEmergencyNarrative = /emergency|urgent|er |ambulance/.test(narrative);

        if (emergencyServices.length === 0 && !hasEmergencyNarrative) return null;

        return {
          detectionId: `nsa_emergency_${Date.now()}`,
          category: 'NSA_ER',
          severity: 'high',
          explanation: 'Emergency services are protected under the No Surprises Act. You should only be charged in-network cost-sharing amounts regardless of the provider\'s network status.',
          evidence: {
            lineRefs: emergencyServices,
            snippets: ['Emergency services detected', hasEmergencyNarrative ? 'Emergency context in description' : '']
          },
          suggestedQuestions: [
            'Why am I being charged out-of-network rates for emergency care?',
            'Should this be covered under No Surprises Act emergency protections?',
            'What is my in-network emergency room cost-sharing?'
          ],
          policyCitations: [
            {
              title: 'No Surprises Act Emergency Services',
              authority: 'Federal',
              citation: 'nsa-emergency-services'
            },
            {
              title: 'Emergency Care Billing Protections',
              authority: 'CMS',
              citation: 'cms-emergency-billing-protections'
            }
          ],
        };
      }
    };
  }

  private createPreventiveRule(): DetectionRule {
    return {
      id: 'preventive',
      name: 'Preventive Care Misclassification',
      category: 'Preventive',
      description: 'Detect preventive services incorrectly billed with cost-sharing',
      check: (context: DetectionContext): Detection | null => {
        const preventiveIssues: string[] = [];

        const preventiveCodes = [
          'G0438', 'G0439', // Annual wellness visits
          '99381', '99382', '99383', '99384', '99385', '99386', '99387', // Preventive E/M new
          '99391', '99392', '99393', '99394', '99395', '99396', '99397', // Preventive E/M established
          '77067', // Screening mammography
          'G0121', // Cervical cancer screening
          '45378', // Screening colonoscopy
        ];

        for (const item of context.lineItems) {
          if (!item.code) continue;

          const isPreventiveCode = preventiveCodes.includes(item.code);
          const hasModifier33 = item.modifiers?.includes('33');

          // Check for preventive indicators in description
          const description = item.description?.toLowerCase() || '';
          const hasPreventiveDescription = /preventive|screening|wellness|annual/.test(description);

          if ((isPreventiveCode || hasModifier33 || hasPreventiveDescription) &&
              (item.patientResp && item.patientResp > 0)) {
            preventiveIssues.push(item.lineId);
          }

          // Check for Z-codes (preventive ICD-10 codes) but charges applied
          if (description.includes('z12') || description.includes('z00')) {
            if (item.patientResp && item.patientResp > 0) {
              preventiveIssues.push(item.lineId);
            }
          }
        }

        if (preventiveIssues.length === 0) return null;

        return {
          detectionId: `preventive_${Date.now()}`,
          category: 'Preventive',
          severity: 'high',
          explanation: 'Found preventive services that should be covered at 100% under ACA requirements but are being charged with cost-sharing. Preventive services must be covered without deductibles, copays, or coinsurance when using in-network providers.',
          evidence: {
            lineRefs: preventiveIssues,
            snippets: [`${preventiveIssues.length} preventive services with charges`]
          },
          suggestedQuestions: [
            'Why am I being charged for preventive services?',
            'Was this coded correctly as a preventive service?',
            'Is my provider in-network for preventive care?'
          ],
          policyCitations: [
            {
              title: 'ACA Preventive Services Requirements',
              authority: 'Federal',
              citation: 'aca-preventive-services'
            },
            {
              title: 'Preventive Care Coverage Guidelines',
              authority: 'CMS',
              citation: 'cms-preventive-care-coverage'
            }
          ],
        };
      }
    };
  }

  private createGlobalSurgeryRule(): DetectionRule {
    return {
      id: 'global_surgery',
      name: 'Global Surgery Package Violations',
      category: 'GlobalSurgery',
      description: 'Detect E/M services billed during global surgery period',
      check: (context: DetectionContext): Detection | null => {
        const violations: string[] = [];

        // Major surgery codes (90-day global period)
        const majorSurgeryCodes = ['27447', '23472', '25609', '63030'];

        // Minor surgery codes (10-day global period)
        const minorSurgeryCodes = ['11042', '12001', '17000', '26055'];

        const surgeryItems = context.lineItems.filter(item =>
          item.code && (
            majorSurgeryCodes.includes(item.code) ||
            minorSurgeryCodes.includes(item.code)
          )
        );

        for (const surgery of surgeryItems) {
          if (!surgery.dos || !surgery.code) continue;

          const surgeryDate = new Date(surgery.dos);
          const isMajor = majorSurgeryCodes.includes(surgery.code);
          const globalDays = isMajor ? 90 : 10;

          // Find E/M services within global period
          const globalEnd = new Date(surgeryDate);
          globalEnd.setDate(globalEnd.getDate() + globalDays);

          const emInGlobal = context.lineItems.filter(item => {
            if (!item.dos || !item.code) return false;

            const itemDate = new Date(item.dos);
            const isEM = /^992[12]/.test(item.code);
            const inGlobalPeriod = itemDate >= surgeryDate && itemDate <= globalEnd;

            return isEM && inGlobalPeriod && !item.modifiers?.includes('24') && !item.modifiers?.includes('79');
          });

          violations.push(...emInGlobal.map(item => item.lineId));
        }

        if (violations.length === 0) return null;

        return {
          detectionId: `global_${Date.now()}`,
          category: 'GlobalSurgery',
          severity: 'warn',
          explanation: 'Found E/M services billed during the global surgery period without appropriate modifiers. These visits are typically included in the surgical fee unless unrelated to the surgery.',
          evidence: {
            lineRefs: violations,
            snippets: [`${violations.length} E/M services in global period`]
          },
          suggestedQuestions: [
            'Why are office visits being billed separately during the global period?',
            'Were these visits unrelated to the surgery?',
            'What documentation supports separate billing?'
          ],
          policyCitations: [
            {
              title: 'Global Surgery Policy',
              authority: 'CMS',
              citation: 'cms-global-surgery-policy'
            }
          ],
        };
      }
    };
  }

  private createDrugUnitsRule(): DetectionRule {
    return {
      id: 'drug_units',
      name: 'Drug/Infusion Unit Anomalies',
      category: 'DrugUnits',
      description: 'Detect implausible drug or infusion units',
      check: (context: DetectionContext): Detection | null => {
        const anomalies: string[] = [];

        for (const item of context.lineItems) {
          if (!item.code || !item.units) continue;

          // J-codes (drugs)
          if (/^J[0-9]{4}/.test(item.code)) {
            // Check for decimal-like units (e.g., 125 units of a drug that comes in 10mg vials)
            if (item.units > 100 && item.units % 10 === 5) {
              anomalies.push(item.lineId);
            }

            // Check for extremely high units
            if (item.units > 1000) {
              anomalies.push(item.lineId);
            }
          }

          // Infusion codes
          if (['96365', '96366', '96367', '96368'].includes(item.code)) {
            // Infusion codes shouldn't typically exceed 8-10 units per day
            if (item.units > 10) {
              anomalies.push(item.lineId);
            }
          }
        }

        if (anomalies.length === 0) return null;

        return {
          detectionId: `drug_units_${Date.now()}`,
          category: 'DrugUnits',
          severity: 'warn',
          explanation: 'Found drug or infusion codes with questionable unit quantities that may not align with typical vial sizes or infusion duration limits.',
          evidence: {
            lineRefs: anomalies,
            snippets: [`${anomalies.length} questionable drug/infusion units`]
          },
          suggestedQuestions: [
            'How were the drug units calculated?',
            'What is the vial size for this medication?',
            'Can you provide the infusion documentation?'
          ],
          policyCitations: [
            {
              title: 'HCPCS Drug Unit Guidelines',
              authority: 'CMS',
              citation: 'cms-hcpcs-drug-units'
            }
          ],
        };
      }
    };
  }

  private createTherapyUnitsRule(): DetectionRule {
    return {
      id: 'therapy_units',
      name: 'Therapy Time Unit Violations',
      category: 'TherapyUnits',
      description: 'Detect therapy services with implausible time units',
      check: (context: DetectionContext): Detection | null => {
        const violations: string[] = [];

        // 15-minute therapy codes
        const therapyCodes15min = ['97110', '97112', '97116', '97530', '97535'];

        for (const item of context.lineItems) {
          if (!item.code || !item.units) continue;

          if (therapyCodes15min.includes(item.code)) {
            // Check for excessive units (more than 6 hours = 24 units)
            if (item.units > 24) {
              violations.push(item.lineId);
            }

            // Check for fractional units that don't make sense
            if (item.units < 1) {
              violations.push(item.lineId);
            }
          }
        }

        if (violations.length === 0) return null;

        return {
          detectionId: `therapy_units_${Date.now()}`,
          category: 'TherapyUnits',
          severity: 'warn',
          explanation: 'Found therapy services with time units that may exceed reasonable session lengths or don\'t align with 15-minute increment billing rules.',
          evidence: {
            lineRefs: violations,
            snippets: [`${violations.length} therapy time unit issues`]
          },
          suggestedQuestions: [
            'How long was the therapy session?',
            'How were the 15-minute units calculated?',
            'Can you provide the therapy documentation?'
          ],
          policyCitations: [
            {
              title: 'Physical Therapy Time-Based Billing',
              authority: 'CMS',
              citation: 'cms-therapy-time-billing'
            }
          ],
        };
      }
    };
  }

  private createTimelyFilingRule(): DetectionRule {
    return {
      id: 'timely_filing',
      name: 'Timely Filing Violations',
      category: 'TimelyFiling',
      description: 'Detect claims denied for untimely filing shifted to patient',
      check: (context: DetectionContext): Detection | null => {
        const violations: string[] = [];

        // Check for timely filing CARC codes (carcRarc not available in DocumentMeta)
        // Would check for CARC 29, 151 indicating timely filing issues
        // violations.push(doc.artifactId) if such issues found

        // Check for late filing indicators in line items
        for (const item of context.lineItems) {
          const description = item.description?.toLowerCase() || '';
          if (description.includes('timely filing') || description.includes('late filing')) {
            violations.push(item.lineId);
          }
        }

        if (violations.length === 0) return null;

        return {
          detectionId: `timely_filing_${Date.now()}`,
          category: 'TimelyFiling',
          severity: 'high',
          explanation: 'Found claims denied for late filing that are being shifted to patient responsibility. Timely filing is typically the provider\'s responsibility, not the patient\'s.',
          evidence: {
            lineRefs: violations,
            snippets: ['Timely filing denial codes detected']
          },
          suggestedQuestions: [
            'Why wasn\'t this claim filed timely with my insurance?',
            'Am I responsible for provider filing deadline failures?',
            'Can you appeal the timely filing denial?'
          ],
          policyCitations: [
            {
              title: 'Timely Filing Requirements',
              authority: 'StateDOI',
              citation: 'state-timely-filing-rules'
            }
          ],
        };
      }
    };
  }

  private createCOBRule(): DetectionRule {
    return {
      id: 'cob',
      name: 'Coordination of Benefits Issues',
      category: 'COB',
      description: 'Detect coordination of benefits problems',
      check: (context: DetectionContext): Detection | null => {
        const issues: string[] = [];

        // Look for indicators that secondary insurance should have been billed
        const narrative = context.userNarrative?.toLowerCase() || '';
        const hasSecondaryInsurance = /secondary|spouse.*insurance|two.*insurance|medicare.*supplement/.test(narrative);

        if (hasSecondaryInsurance) {
          // Check if any items show unprocessed secondary amounts
          for (const item of context.lineItems) {
            if (item.patientResp && item.patientResp > 0 && item.planPaid && item.allowed) {
              const uncoveredAmount = item.allowed - item.planPaid;
              if (uncoveredAmount > 1000) { // $10+ uncovered
                issues.push(item.lineId);
              }
            }
          }
        }

        if (issues.length === 0) return null;

        return {
          detectionId: `cob_${Date.now()}`,
          category: 'COB',
          severity: 'warn',
          explanation: 'Potential coordination of benefits issue detected. If you have secondary insurance coverage, those claims should be submitted to reduce your patient responsibility.',
          evidence: {
            lineRefs: issues,
            snippets: ['Secondary insurance indicated but not processed']
          },
          suggestedQuestions: [
            'Did you submit this claim to my secondary insurance?',
            'What is the coordination of benefits process?',
            'How do I ensure both insurances process claims correctly?'
          ],
          policyCitations: [
            {
              title: 'Coordination of Benefits Requirements',
              authority: 'StateDOI',
              citation: 'state-cob-requirements'
            }
          ],
        };
      }
    };
  }

  private createEOBZeroStillBilledRule(): DetectionRule {
    return {
      id: 'eob_zero_billed',
      name: 'EOB Shows Zero But Still Billed',
      category: 'EOBZeroStillBilled',
      description: 'Detect billing when EOB shows zero patient responsibility',
      check: (context: DetectionContext): Detection | null => {
        const violations: string[] = [];

        for (const item of context.lineItems) {
          // If EOB data shows zero patient responsibility but there's still a charge
          if (item.patientResp === 0 && item.charge && item.charge > 0) {
            // Check if this is from an EOB document
            const eobDoc = context.documents.find(doc =>
              doc.docType === 'EOB'
            );

            if (eobDoc) {
              violations.push(item.lineId);
            }
          }
        }

        if (violations.length === 0) return null;

        return {
          detectionId: `eob_zero_${Date.now()}`,
          category: 'EOBZeroStillBilled',
          severity: 'high',
          explanation: 'Found charges for services where the EOB shows zero patient responsibility. This appears to be a posting error.',
          evidence: {
            lineRefs: violations,
            snippets: [`${violations.length} items showing zero on EOB but billed`]
          },
          suggestedQuestions: [
            'Why am I being billed when the EOB shows zero patient responsibility?',
            'Is this a posting error in your billing system?',
            'Can you provide a corrected statement?'
          ],
          policyCitations: [
            {
              title: 'Accurate Billing Requirements',
              authority: 'StateDOI',
              citation: 'state-accurate-billing-rules'
            }
          ],
        };
      }
    };
  }

  private createMathErrorRule(): DetectionRule {
    return {
      id: 'math_error',
      name: 'Mathematical Calculation Errors',
      category: 'MathError',
      description: 'Detect basic math errors in billing calculations',
      check: (context: DetectionContext): Detection | null => {
        const errors: string[] = [];

        // Check line item math
        for (const item of context.lineItems) {
          if (item.allowed && item.planPaid && item.patientResp) {
            const calculatedPatientResp = item.allowed - item.planPaid;
            const actualPatientResp = item.patientResp;

            // Allow for rounding differences of up to $1
            if (Math.abs(calculatedPatientResp - actualPatientResp) > 100) { // $1 in cents
              errors.push(item.lineId);
            }
          }
        }

        // Check document totals
        for (const doc of context.documents) {
          if (doc.totals?.billed && doc.totals?.allowed && doc.totals?.planPaid && doc.totals?.patientResp) {
            const calculatedPatientResp = doc.totals.allowed - doc.totals.planPaid;
            const actualPatientResp = doc.totals.patientResp;

            if (Math.abs(calculatedPatientResp - actualPatientResp) > 500) { // $5 tolerance
              errors.push(doc.artifactId);
            }
          }
        }

        if (errors.length === 0) return null;

        return {
          detectionId: `math_error_${Date.now()}`,
          category: 'MathError',
          severity: 'warn',
          explanation: 'Found mathematical calculation errors where patient responsibility doesn\'t equal allowed amount minus plan paid amount.',
          evidence: {
            lineRefs: errors,
            snippets: [`${errors.length} calculation errors detected`]
          },
          suggestedQuestions: [
            'Can you verify the math on these charges?',
            'Why doesn\'t patient responsibility equal allowed minus plan paid?',
            'Can you provide a corrected calculation?'
          ],
          policyCitations: [
            {
              title: 'Accurate Billing Standards',
              authority: 'StateDOI',
              citation: 'state-billing-accuracy-requirements'
            }
          ],
        };
      }
    };
  }

  private createObservationRule(): DetectionRule {
    return {
      id: 'observation',
      name: 'Observation vs Inpatient Status Issues',
      category: 'ObsVsInpatient',
      description: 'Detect observation status causing higher patient liability',
      check: (context: DetectionContext): Detection | null => {
        const issues: string[] = [];

        const narrative = context.userNarrative?.toLowerCase() || '';
        const hasObservationIndicators = /observation|outpatient|not admitted/.test(narrative);
        const hasInpatientExpectation = /admitted|inpatient|hospital stay/.test(narrative);

        // Look for revenue codes indicating observation
        for (const item of context.lineItems) {
          if (item.revCode === '0762') { // Observation revenue code
            if (item.charge && item.charge > 50000) { // $500+ observation charges
              issues.push(item.lineId);
            }
          }
        }

        if (issues.length === 0 && !hasObservationIndicators) return null;

        return {
          detectionId: `observation_${Date.now()}`,
          category: 'ObsVsInpatient',
          severity: 'warn',
          explanation: 'Found observation status charges that may result in higher patient costs compared to inpatient admission. Observation status often has different cost-sharing rules.',
          evidence: {
            lineRefs: issues,
            snippets: ['Observation status charges detected']
          },
          suggestedQuestions: [
            'Why was I placed in observation rather than admitted as inpatient?',
            'What are the cost differences between observation and inpatient?',
            'Can the observation decision be reviewed or appealed?'
          ],
          policyCitations: [
            {
              title: 'Medicare 2-Midnight Rule',
              authority: 'CMS',
              citation: 'cms-2-midnight-rule'
            },
            {
              title: 'Observation vs Inpatient Guidelines',
              authority: 'CMS',
              citation: 'cms-observation-guidelines'
            }
          ],
        };
      }
    };
  }

  private createNonProviderFeeRule(): DetectionRule {
    return {
      id: 'non_provider_fee',
      name: 'Non-Provider Administrative Fees',
      category: 'NonProviderFee',
      description: 'Detect inappropriate administrative or processing fees',
      check: (context: DetectionContext): Detection | null => {
        const nonProviderFees: string[] = [];

        for (const item of context.lineItems) {
          const description = item.description?.toLowerCase() || '';

          const nonProviderFeeIndicators = [
            'statement fee', 'processing fee', 'administrative fee', 'billing fee',
            'collection fee', 'convenience fee', 'service charge'
          ];

          for (const indicator of nonProviderFeeIndicators) {
            if (description.includes(indicator)) {
              nonProviderFees.push(item.lineId);
              break;
            }
          }
        }

        if (nonProviderFees.length === 0) return null;

        return {
          detectionId: `non_provider_fee_${Date.now()}`,
          category: 'NonProviderFee',
          severity: 'warn',
          explanation: 'Found administrative or processing fees that may not be appropriate charges for medical services. Many states prohibit certain types of billing fees.',
          evidence: {
            lineRefs: nonProviderFees,
            snippets: [`${nonProviderFees.length} administrative fees detected`]
          },
          suggestedQuestions: [
            'What medical service does this fee represent?',
            'Are administrative fees allowed under state law?',
            'Can these fees be waived or removed?'
          ],
          policyCitations: [
            {
              title: 'Prohibited Billing Fees',
              authority: 'StateDOI',
              citation: 'state-prohibited-billing-fees'
            }
          ],
        };
      }
    };
  }

  private createMissingItemizedRule(): DetectionRule {
    return {
      id: 'missing_itemized',
      name: 'Missing Itemized Statement',
      category: 'MissingItemized',
      description: 'Detect when only summary bill provided',
      check: (context: DetectionContext): Detection | null => {
        // Check if we have very few line items relative to high charges
        const totalCharges = context.lineItems.reduce((sum, item) => sum + (item.charge || 0), 0);
        const lineItemCount = context.lineItems.length;

        // If high charges but very few line items, might be summary only
        if (totalCharges > 100000 && lineItemCount < 3) { // $1000+ but less than 3 line items
          return {
            detectionId: `missing_itemized_${Date.now()}`,
            category: 'MissingItemized',
            severity: 'info',
            explanation: 'This appears to be a summary bill without detailed line items. You have the right to request an itemized statement showing all charges and services.',
            evidence: {
              snippets: [`High charges ($${(totalCharges/100).toFixed(2)}) with only ${lineItemCount} line items`]
            },
            suggestedQuestions: [
              'Can you provide an itemized statement showing all charges?',
              'What specific services are included in these charges?',
              'I\'d like a detailed breakdown of all fees and services'
            ],
            policyCitations: [
              {
                title: 'Patient Right to Itemized Bill',
                authority: 'StateDOI',
                citation: 'state-itemized-bill-rights'
              }
            ],
          };
        }

        return null;
      }
    };
  }
}