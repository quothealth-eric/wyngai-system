import { Detection, DocumentStructure, BenefitsContext, DetectionRule, MoneyCents, PolicyCitation } from '@/types/analyzer';

export class BenefitsAwareEngine {
  private rules: DetectionRule[] = [];

  constructor() {
    this.initializeBenefitsRules();
  }

  public runBenefitsDetections(structure: DocumentStructure, benefits: BenefitsContext): Detection[] {
    const detections: Detection[] = [];

    for (const rule of this.rules) {
      try {
        const detection = rule.check(structure, benefits);
        if (detection) {
          detections.push(detection);
        }
      } catch (error) {
        console.error(`Benefits detection rule ${rule.id} failed:`, error);
      }
    }

    return detections;
  }

  private initializeBenefitsRules(): void {
    this.rules = [
      this.createBenefitsMathRule(),
      this.createNetworkStatusRule(),
      this.createPriorAuthRule(),
      this.createPreventiveWithBenefitsRule(),
      this.createOOPMaxRule(),
      this.createSecondaryCoverageRule(),
      this.createDeductibleCalculationRule(),
      this.createCoinsuranceCalculationRule(),
      this.createCopayApplicationRule(),
      this.createInNetworkFacilityOONAncillaryRule()
    ];
  }

  private createBenefitsMathRule(): DetectionRule {
    return {
      id: 'benefits_math_recalc',
      name: 'Benefits Math Recalculation',
      category: 'BenefitsMath',
      severity: 'high',
      requiresBenefits: true,
      check: (structure: DocumentStructure, benefits?: BenefitsContext) => {
        if (!benefits) return null;

        const totals = structure.totals;
        const allowed = totals.allowed || totals.billed || 0;
        const actualPatientResp = totals.patientResponsibility || 0;

        // Calculate expected patient responsibility
        const expectedResp = this.calculateExpectedPatientResponsibility(allowed, benefits);
        const delta = actualPatientResp - expectedResp.total;

        // If difference is more than $25, flag it
        if (Math.abs(delta) > 2500) { // $25 in cents
          return {
            detectionId: 'benefits_math_001',
            category: 'BenefitsMath',
            severity: 'high',
            explanation: `Benefits calculation appears incorrect. Expected patient responsibility: $${(expectedResp.total / 100).toFixed(2)}, but bill shows: $${(actualPatientResp / 100).toFixed(2)}`,
            mathDelta: {
              expected: expectedResp.total,
              observed: actualPatientResp
            },
            evidence: {
              snippets: [
                `Deductible portion: $${(expectedResp.deductible / 100).toFixed(2)}`,
                `Coinsurance portion: $${(expectedResp.coinsurance / 100).toFixed(2)}`,
                `Copay portion: $${(expectedResp.copay / 100).toFixed(2)}`,
                `Total expected: $${(expectedResp.total / 100).toFixed(2)}`,
                `Actual billed: $${(actualPatientResp / 100).toFixed(2)}`,
                `Difference: $${(Math.abs(delta) / 100).toFixed(2)}`
              ]
            },
            suggestedQuestions: [
              'Has your deductible amount been applied correctly?',
              'Is the coinsurance percentage calculation accurate?',
              'Are there any copays that should apply to this service?',
              'Have you reached your out-of-pocket maximum for the year?'
            ],
            policyCitations: [{
              title: 'Insurance Contract Benefit Calculation Requirements',
              citation: 'insurance-benefit-calculation-accuracy',
              authority: 'StateDOI'
            }]
          };
        }

        return null;
      }
    };
  }

  private createNetworkStatusRule(): DetectionRule {
    return {
      id: 'network_status_check',
      name: 'Network Status Verification',
      category: 'NSA_Ancillary',
      severity: 'warn',
      requiresBenefits: true,
      check: (structure: DocumentStructure, benefits?: BenefitsContext) => {
        if (!benefits?.network) return null;

        const actualNetwork = benefits.network;
        const patientResp = structure.totals.patientResponsibility || 0;
        const allowed = structure.totals.allowed || structure.totals.billed || 0;

        // If processed as out-of-network but benefits indicate in-network
        if (actualNetwork === 'IN' && patientResp > allowed * 0.4) { // More than 40% suggests OON processing
          return {
            detectionId: 'network_001',
            category: 'NSA_Ancillary',
            severity: 'warn',
            explanation: 'Claim may have been processed as out-of-network despite provider being in-network according to your benefits information.',
            evidence: {
              snippets: [
                `Benefits indicate: In-network`,
                `Patient responsibility: ${((patientResp / allowed) * 100).toFixed(0)}% of allowed amount`,
                'This high percentage suggests out-of-network processing'
              ]
            },
            suggestedQuestions: [
              'Was this provider verified as in-network before the service?',
              'Did the provider submit this claim correctly to your insurance?',
              'Should this be reprocessed as an in-network claim?'
            ],
            policyCitations: [{
              title: 'Provider Network Status Verification',
              citation: 'provider-network-status-requirements',
              authority: 'PayerPolicy'
            }]
          };
        }

        return null;
      }
    };
  }

  private createPriorAuthRule(): DetectionRule {
    return {
      id: 'prior_auth_denial',
      name: 'Prior Authorization Issues',
      category: 'NSA_Ancillary',
      severity: 'high',
      requiresBenefits: true,
      check: (structure: DocumentStructure, benefits?: BenefitsContext) => {
        if (!benefits?.priorAuthRequired) return null;

        // Look for prior auth denial codes
        const priorAuthCodes = ['50', '52', '53'];
        const hasPriorAuthDenial = structure.remarkCodes.some(code =>
          priorAuthCodes.includes(code.code)
        );

        // Check if this is emergency or NSA-protected service
        const emergencyKeywords = ['emergency', 'er', 'trauma', 'urgent'];
        const hasEmergencyIndicators = structure.lineItems.some(item => {
          const desc = item.description?.toLowerCase() || '';
          return emergencyKeywords.some(keyword => desc.includes(keyword));
        });

        if (hasPriorAuthDenial && hasEmergencyIndicators) {
          return {
            detectionId: 'prior_auth_001',
            category: 'NSA_Ancillary',
            severity: 'high',
            explanation: 'Prior authorization denial for emergency services. Emergency care should not require prior authorization.',
            evidence: {
              snippets: [
                'Prior authorization denial codes detected',
                'Emergency service indicators present'
              ]
            },
            suggestedQuestions: [
              'Was this truly emergency care that could not be delayed?',
              'Did you have time to obtain prior authorization?',
              'Should this denial be appealed based on emergency circumstances?'
            ],
            policyCitations: [{
              title: 'Emergency Services Prior Authorization Restrictions',
              citation: 'emergency-prior-auth-restrictions',
              authority: 'Federal'
            }]
          };
        }

        return null;
      }
    };
  }

  private createPreventiveWithBenefitsRule(): DetectionRule {
    return {
      id: 'preventive_benefits_aware',
      name: 'Preventive Services with Benefits Context',
      category: 'Preventive',
      severity: 'high',
      requiresBenefits: true,
      check: (structure: DocumentStructure, benefits?: BenefitsContext) => {
        if (!benefits) return null;

        const preventiveKeywords = [
          'annual', 'wellness', 'screening', 'preventive', 'mammogram',
          'colonoscopy', 'physical exam', 'checkup', 'vaccine'
        ];

        const preventiveItems = structure.lineItems.filter(item => {
          const desc = item.description?.toLowerCase() || '';
          return preventiveKeywords.some(keyword => desc.includes(keyword));
        });

        if (preventiveItems.length === 0) return null;

        const hasPatientCost = preventiveItems.some(item => (item.patientResp || 0) > 0);

        // If in-network and preventive with patient cost
        if (benefits.network === 'IN' && hasPatientCost) {
          return {
            detectionId: 'prev_benefits_001',
            category: 'Preventive',
            severity: 'high',
            explanation: 'In-network preventive services should be covered at 100% under ACA requirements. Patient cost-sharing detected.',
            evidence: {
              lineRefs: preventiveItems.map(item => item.lineId),
              snippets: [
                'In-network provider confirmed',
                ...preventiveItems.map(item => `${item.description}: $${((item.patientResp || 0) / 100).toFixed(2)} patient cost`)
              ]
            },
            suggestedQuestions: [
              'Was this service coded as preventive (not diagnostic)?',
              'Were additional non-preventive services performed during the same visit?',
              'Should this be resubmitted with correct preventive coding?'
            ],
            policyCitations: [{
              title: 'ACA Preventive Services No Cost-Sharing Requirement',
              citation: 'aca-preventive-no-cost-sharing',
              authority: 'Federal'
            }]
          };
        }

        return null;
      }
    };
  }

  private createOOPMaxRule(): DetectionRule {
    return {
      id: 'oop_max_reached',
      name: 'Out-of-Pocket Maximum Reached',
      category: 'BenefitsMath',
      severity: 'high',
      requiresBenefits: true,
      check: (structure: DocumentStructure, benefits?: BenefitsContext) => {
        if (!benefits?.oopMax?.met || !benefits.oopMax.individual) return null;

        const oopMaxMet = benefits.oopMax.met;
        const oopMaxLimit = benefits.oopMax.individual;
        const patientResp = structure.totals.patientResponsibility || 0;

        // If OOP max is reached, patient should owe $0 (except for non-covered services)
        if (oopMaxMet >= oopMaxLimit && patientResp > 0) {
          return {
            detectionId: 'oop_max_001',
            category: 'BenefitsMath',
            severity: 'high',
            explanation: `Out-of-pocket maximum has been reached ($${(oopMaxMet / 100).toFixed(2)} of $${(oopMaxLimit / 100).toFixed(2)}). Patient responsibility should be $0 for covered services.`,
            mathDelta: {
              expected: 0,
              observed: patientResp
            },
            evidence: {
              snippets: [
                `OOP max limit: $${(oopMaxLimit / 100).toFixed(2)}`,
                `Amount already paid toward OOP max: $${(oopMaxMet / 100).toFixed(2)}`,
                `Patient responsibility on this bill: $${(patientResp / 100).toFixed(2)}`,
                'Patient should owe $0 for covered services'
              ]
            },
            suggestedQuestions: [
              'Has your insurance been notified that your out-of-pocket maximum is met?',
              'Are these services covered under your plan?',
              'Should this claim be reprocessed with updated accumulator information?'
            ],
            policyCitations: [{
              title: 'Out-of-Pocket Maximum Protection',
              citation: 'aca-oop-maximum-protection',
              authority: 'Federal'
            }]
          };
        }

        return null;
      }
    };
  }

  private createSecondaryCoverageRule(): DetectionRule {
    return {
      id: 'secondary_coverage',
      name: 'Secondary Coverage Coordination',
      category: 'COB',
      severity: 'warn',
      requiresBenefits: true,
      check: (structure: DocumentStructure, benefits?: BenefitsContext) => {
        if (!benefits?.secondaryCoverage) return null;

        const patientResp = structure.totals.patientResponsibility || 0;

        // If there's secondary coverage and patient still has responsibility
        if (patientResp > 0) {
          return {
            detectionId: 'secondary_001',
            category: 'COB',
            severity: 'warn',
            explanation: 'Secondary insurance coverage available. Remaining patient responsibility may be covered by secondary plan.',
            evidence: {
              snippets: [
                'Secondary coverage indicated in benefits',
                `Current patient responsibility: $${(patientResp / 100).toFixed(2)}`,
                'This amount may be covered by secondary insurance'
              ]
            },
            suggestedQuestions: [
              'Has this claim been submitted to your secondary insurance?',
              'What is the coordination of benefits order for your plans?',
              'Should you wait for secondary processing before paying?'
            ],
            policyCitations: [{
              title: 'Coordination of Benefits - Secondary Claims',
              citation: 'cob-secondary-claims-processing',
              authority: 'PayerPolicy'
            }]
          };
        }

        return null;
      }
    };
  }

  private createDeductibleCalculationRule(): DetectionRule {
    return {
      id: 'deductible_calculation',
      name: 'Deductible Calculation Verification',
      category: 'BenefitsMath',
      severity: 'warn',
      requiresBenefits: true,
      check: (structure: DocumentStructure, benefits?: BenefitsContext) => {
        if (!benefits?.deductible?.individual) return null;

        const allowed = structure.totals.allowed || structure.totals.billed || 0;
        const deductibleApplied = structure.totals.deductible || 0;
        const deductibleLimit = benefits.deductible.individual;
        const deductibleMet = benefits.deductible.met || 0;

        const remainingDeductible = Math.max(0, deductibleLimit - deductibleMet);
        const expectedDeductibleApplied = Math.min(allowed, remainingDeductible);

        if (Math.abs(deductibleApplied - expectedDeductibleApplied) > 1000) { // $10 tolerance
          return {
            detectionId: 'deductible_001',
            category: 'BenefitsMath',
            severity: 'warn',
            explanation: `Deductible calculation may be incorrect. Expected: $${(expectedDeductibleApplied / 100).toFixed(2)}, Applied: $${(deductibleApplied / 100).toFixed(2)}`,
            mathDelta: {
              expected: expectedDeductibleApplied,
              observed: deductibleApplied
            },
            evidence: {
              snippets: [
                `Annual deductible: $${(deductibleLimit / 100).toFixed(2)}`,
                `Previously met: $${(deductibleMet / 100).toFixed(2)}`,
                `Remaining: $${(remainingDeductible / 100).toFixed(2)}`,
                `Applied to this claim: $${(deductibleApplied / 100).toFixed(2)}`
              ]
            },
            suggestedQuestions: [
              'What is your current deductible status with your insurance?',
              'Has the deductible been calculated correctly for this claim?'
            ],
            policyCitations: [{
              title: 'Deductible Calculation Standards',
              citation: 'deductible-calculation-requirements',
              authority: 'PayerPolicy'
            }]
          };
        }

        return null;
      }
    };
  }

  private createCoinsuranceCalculationRule(): DetectionRule {
    return {
      id: 'coinsurance_calculation',
      name: 'Coinsurance Calculation Verification',
      category: 'BenefitsMath',
      severity: 'warn',
      requiresBenefits: true,
      check: (structure: DocumentStructure, benefits?: BenefitsContext) => {
        if (!benefits?.coinsurance) return null;

        const allowed = structure.totals.allowed || structure.totals.billed || 0;
        const deductibleApplied = structure.totals.deductible || 0;
        const coinsuranceApplied = structure.totals.coinsurance || 0;

        const amountAfterDeductible = allowed - deductibleApplied;
        const expectedCoinsurance = Math.max(0, amountAfterDeductible * (benefits.coinsurance / 100));

        if (Math.abs(coinsuranceApplied - expectedCoinsurance) > 1000) { // $10 tolerance
          return {
            detectionId: 'coinsurance_001',
            category: 'BenefitsMath',
            severity: 'warn',
            explanation: `Coinsurance calculation may be incorrect. Expected ${benefits.coinsurance}% of $${(amountAfterDeductible / 100).toFixed(2)} = $${(expectedCoinsurance / 100).toFixed(2)}, but $${(coinsuranceApplied / 100).toFixed(2)} was applied.`,
            mathDelta: {
              expected: expectedCoinsurance,
              observed: coinsuranceApplied
            },
            evidence: {
              snippets: [
                `Coinsurance rate: ${benefits.coinsurance}%`,
                `Amount after deductible: $${(amountAfterDeductible / 100).toFixed(2)}`,
                `Expected coinsurance: $${(expectedCoinsurance / 100).toFixed(2)}`,
                `Applied coinsurance: $${(coinsuranceApplied / 100).toFixed(2)}`
              ]
            },
            suggestedQuestions: [
              'Is the coinsurance percentage correct for this type of service?',
              'Was the deductible applied correctly before calculating coinsurance?'
            ],
            policyCitations: [{
              title: 'Coinsurance Calculation Standards',
              citation: 'coinsurance-calculation-requirements',
              authority: 'PayerPolicy'
            }]
          };
        }

        return null;
      }
    };
  }

  private createCopayApplicationRule(): DetectionRule {
    return {
      id: 'copay_application',
      name: 'Copay Application Verification',
      category: 'BenefitsMath',
      severity: 'warn',
      requiresBenefits: true,
      check: (structure: DocumentStructure, benefits?: BenefitsContext) => {
        if (!benefits?.copays) return null;

        const issues: string[] = [];

        // Check common copay scenarios
        for (const item of structure.lineItems) {
          if (!item.code?.value) continue;

          const cptCode = parseInt(item.code.value);
          let expectedCopay = 0;

          // Office visits
          if (cptCode >= 99200 && cptCode <= 99499) {
            expectedCopay = benefits.copays['office_visit'] || 0;
          }
          // Specialist visits
          else if (cptCode >= 99200 && cptCode <= 99215) {
            expectedCopay = benefits.copays['specialist'] || 0;
          }
          // Emergency room
          else if (item.pos === '23') {
            expectedCopay = benefits.copays['emergency_room'] || 0;
          }

          if (expectedCopay > 0) {
            const appliedCopay = item.patientResp || 0;
            if (Math.abs(appliedCopay - expectedCopay) > 500) { // $5 tolerance
              issues.push(`${item.code.value}: Expected copay $${(expectedCopay / 100).toFixed(2)}, applied $${(appliedCopay / 100).toFixed(2)}`);
            }
          }
        }

        if (issues.length > 0) {
          return {
            detectionId: 'copay_001',
            category: 'BenefitsMath',
            severity: 'warn',
            explanation: `Found ${issues.length} potential copay application issues.`,
            evidence: { snippets: issues },
            suggestedQuestions: [
              'Are the copay amounts correct for these types of visits?',
              'Should copays apply instead of deductible/coinsurance for these services?'
            ],
            policyCitations: [{
              title: 'Copay Application Standards',
              citation: 'copay-application-requirements',
              authority: 'PayerPolicy'
            }]
          };
        }

        return null;
      }
    };
  }

  private createInNetworkFacilityOONAncillaryRule(): DetectionRule {
    return {
      id: 'in_network_facility_oon_ancillary',
      name: 'In-Network Facility with Out-of-Network Ancillary',
      category: 'NSA_Ancillary',
      severity: 'high',
      requiresBenefits: true,
      check: (structure: DocumentStructure, benefits?: BenefitsContext) => {
        if (!benefits || benefits.network !== 'IN') return null;

        // Look for ancillary providers
        const ancillaryKeywords = [
          'anesthesia', 'pathology', 'radiology', 'emergency physician',
          'hospitalist', 'assistant surgeon'
        ];

        const providerName = structure.header.providerName?.toLowerCase() || '';
        const isAncillary = ancillaryKeywords.some(keyword => providerName.includes(keyword));

        // High patient responsibility suggests out-of-network processing
        const patientResp = structure.totals.patientResponsibility || 0;
        const allowed = structure.totals.allowed || structure.totals.billed || 0;
        const patientPercentage = allowed > 0 ? (patientResp / allowed) : 0;

        if (isAncillary && patientPercentage > 0.4) { // >40% suggests OON
          return {
            detectionId: 'in_net_facility_oon_anc_001',
            category: 'NSA_Ancillary',
            severity: 'high',
            explanation: 'Ancillary provider at in-network facility processed as out-of-network. No Surprises Act may limit your cost-sharing to in-network amounts.',
            evidence: {
              snippets: [
                `Provider type: ${structure.header.providerName}`,
                `Patient responsibility: ${(patientPercentage * 100).toFixed(0)}% of allowed amount`,
                'High percentage suggests out-of-network processing',
                'In-network facility confirmed in benefits'
              ]
            },
            suggestedQuestions: [
              'Was the main facility in your insurance network?',
              'Did you receive advance notice of out-of-network ancillary providers?',
              'Were you given an opportunity to choose an in-network provider?'
            ],
            policyCitations: [{
              title: 'No Surprises Act - Facility-Based Ancillary Provider Protection',
              citation: 'nsa-facility-based-ancillary-protection',
              authority: 'Federal'
            }]
          };
        }

        return null;
      }
    };
  }

  private calculateExpectedPatientResponsibility(
    allowed: MoneyCents,
    benefits: BenefitsContext
  ): { deductible: MoneyCents; coinsurance: MoneyCents; copay: MoneyCents; total: MoneyCents } {
    let deductibleOwed = 0;
    let coinsuranceOwed = 0;
    let copayOwed = 0;

    // Calculate deductible portion
    if (benefits.deductible?.individual) {
      const deductibleMet = benefits.deductible.met || 0;
      const remainingDeductible = Math.max(0, benefits.deductible.individual - deductibleMet);
      deductibleOwed = Math.min(allowed, remainingDeductible);
    }

    // Calculate coinsurance portion
    if (benefits.coinsurance && deductibleOwed < allowed) {
      const amountAfterDeductible = allowed - deductibleOwed;
      coinsuranceOwed = amountAfterDeductible * (benefits.coinsurance / 100);
    }

    // Note: Copays would typically replace deductible/coinsurance for certain services
    // This is a simplified calculation

    return {
      deductible: deductibleOwed,
      coinsurance: coinsuranceOwed,
      copay: copayOwed,
      total: deductibleOwed + coinsuranceOwed + copayOwed
    };
  }
}