import { Detection, DocumentMeta, LineItem, BenefitsContext, MoneyCents } from '@/types/analyzer';

export class BenefitsAwareMathEngine {
  public async calculateBenefitsMath(
    lineItems: LineItem[],
    documents: DocumentMeta[],
    benefits: BenefitsContext
  ): Promise<Detection[]> {
    console.log('💰 Running benefits-aware calculations...');

    const detections: Detection[] = [];

    // Calculate expected vs actual patient responsibility
    detections.push(...this.calculateDeductibleMath(lineItems, benefits));
    detections.push(...this.calculateCoinsuranceMath(lineItems, benefits));
    detections.push(...this.calculateCopayMath(lineItems, benefits));
    detections.push(...this.calculateOutOfPocketMax(lineItems, benefits));
    detections.push(...this.checkNetworkAccuracy(lineItems, documents, benefits));

    console.log(`💰 Benefits math complete: ${detections.length} calculations performed`);
    return detections.filter(d => d !== null);
  }

  private calculateDeductibleMath(lineItems: LineItem[], benefits: BenefitsContext): Detection[] {
    const detections: Detection[] = [];

    if (!benefits.deductible?.individual) return detections;

    const totalCharges = lineItems.reduce((sum, item) => sum + (item.charge || 0), 0);
    const totalAllowed = lineItems.reduce((sum, item) => sum + (item.allowed || item.charge || 0), 0);
    const actualPatientResp = lineItems.reduce((sum, item) => sum + (item.patientResp || 0), 0);

    const deductibleMet = benefits.deductible.met || 0;
    const deductibleRemaining = Math.max(0, benefits.deductible.individual - deductibleMet);

    // Calculate expected patient responsibility considering deductible
    const deductiblePortion = Math.min(deductibleRemaining, totalAllowed);
    const postDeductibleAmount = Math.max(0, totalAllowed - deductiblePortion);
    const coinsuranceAmount = postDeductibleAmount * (benefits.coinsurance ?? 0.2);
    const expectedPatientResp = deductiblePortion + coinsuranceAmount;

    const mathDifference = Math.abs(actualPatientResp - expectedPatientResp);

    if (mathDifference > 500) { // $5.00 threshold
      detections.push({
        detectionId: `deduct_math_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        category: 'BenefitsMath',
        severity: mathDifference > 5000 ? 'high' : 'warn',
        explanation: `Deductible calculation discrepancy detected. Expected patient responsibility $${(expectedPatientResp / 100).toFixed(2)} based on plan benefits, but actual charge is $${(actualPatientResp / 100).toFixed(2)}.`,
        mathDelta: {
          expected: expectedPatientResp,
          observed: actualPatientResp,
          breakdown: {
            deductiblePortion: deductiblePortion,
            coinsurancePortion: Math.round(coinsuranceAmount),
            deductibleRemaining: deductibleRemaining,
            totalAllowed: totalAllowed
          }
        },
        evidence: {
          lineRefs: lineItems.map(item => item.lineId),
          snippets: [
            `Individual deductible: $${(benefits.deductible.individual / 100).toFixed(2)}`,
            `Deductible met: $${(deductibleMet / 100).toFixed(2)}`,
            `Coinsurance rate: ${((benefits.coinsurance ?? 0.2) * 100).toFixed(0)}%`
          ]
        },
        suggestedQuestions: [
          'Has the annual deductible been met for other services this year?',
          'Are there plan-specific deductible rules that apply?',
          'Was the correct allowed amount used for calculations?'
        ],
        policyCitations: [{
          title: 'Health Plan Deductible Calculation Standards',
          citation: 'ERISA Section 503, 29 CFR 2560.503-1',
          authority: 'Federal'
        }],
        confidence: 85
      });
    }

    return detections;
  }

  private calculateCoinsuranceMath(lineItems: LineItem[], benefits: BenefitsContext): Detection[] {
    const detections: Detection[] = [];

    if (!benefits.coinsurance) return detections;

    // Check coinsurance calculations for post-deductible amounts
    lineItems.forEach(item => {
      if (item.allowed && item.planPaid && item.patientResp) {
        const allowedAmount = item.allowed;
        const expectedCoinsurance = Math.round(allowedAmount * (benefits.coinsurance ?? 0.2));
        const actualCoinsurance = item.patientResp;
        const difference = Math.abs(actualCoinsurance - expectedCoinsurance);

        if (difference > 200) { // $2.00 threshold per line item
          detections.push({
            detectionId: `coins_math_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            category: 'BenefitsMath',
            severity: difference > 1000 ? 'high' : 'warn',
            explanation: `Coinsurance calculation error for ${item.code?.value}. Expected ${((benefits.coinsurance ?? 0.2) * 100).toFixed(0)}% coinsurance ($${(expectedCoinsurance / 100).toFixed(2)}) but charged $${(actualCoinsurance / 100).toFixed(2)}.`,
            mathDelta: {
              expected: expectedCoinsurance,
              observed: actualCoinsurance,
              breakdown: {
                allowedAmount: allowedAmount,
                coinsuranceRate: benefits.coinsurance,
                planPaid: item.planPaid
              }
            },
            evidence: {
              lineRefs: [item.lineId],
              snippets: [
                `Code: ${item.code?.value}`,
                `Allowed: $${(allowedAmount / 100).toFixed(2)}`,
                `Plan coinsurance: ${((benefits.coinsurance ?? 0.2) * 100).toFixed(0)}%`
              ]
            },
            suggestedQuestions: [
              'Was this service subject to deductible before coinsurance applied?',
              'Are there plan-specific coinsurance rates for this service type?'
            ],
            policyCitations: [{
              title: 'Health Plan Cost-Sharing Calculation Requirements',
              citation: 'ACA Section 1302, 45 CFR 156.130',
              authority: 'Federal'
            }],
            confidence: 80
          });
        }
      }
    });

    return detections;
  }

  private calculateCopayMath(lineItems: LineItem[], benefits: BenefitsContext): Detection[] {
    const detections: Detection[] = [];

    if (!benefits.copays) return detections;

    // Check for copay services
    lineItems.forEach(item => {
      const code = item.code?.value;
      if (!code) return;

      // Map codes to copay categories
      let copayCategory: string | null = null;
      if (code.match(/^99[0-9]{3}$/)) copayCategory = 'office_visit';
      if (code.match(/^99[0-9]{3}$/) && code.startsWith('992')) copayCategory = 'specialist';
      if (code === '99213' || code === '99214') copayCategory = 'primary_care';

      if (copayCategory && benefits.copays?.[copayCategory]) {
        const expectedCopay = benefits.copays[copayCategory];
        const actualPatientResp = item.patientResp || 0;

        if (actualPatientResp !== expectedCopay) {
          detections.push({
            detectionId: `copay_math_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            category: 'BenefitsMath',
            severity: 'warn',
            explanation: `Copay discrepancy for ${code}. Expected ${copayCategory.replace('_', ' ')} copay of $${(expectedCopay / 100).toFixed(2)} but charged $${(actualPatientResp / 100).toFixed(2)}.`,
            mathDelta: {
              expected: expectedCopay,
              observed: actualPatientResp,
              breakdown: {
                serviceCategory: copayCategory,
                planCopay: expectedCopay
              }
            },
            evidence: {
              lineRefs: [item.lineId],
              snippets: [
                `Service: ${item.description || code}`,
                `Plan copay for ${copayCategory}: $${(expectedCopay / 100).toFixed(2)}`
              ]
            },
            suggestedQuestions: [
              'Was this visit subject to deductible instead of copay?',
              'Does the plan have different copays for this provider type?'
            ],
            policyCitations: [{
              title: 'Health Plan Copayment Requirements',
              citation: 'ERISA Section 503, Summary Plan Description Requirements',
              authority: 'Federal'
            }],
            confidence: 75
          });
        }
      }
    });

    return detections;
  }

  private calculateOutOfPocketMax(lineItems: LineItem[], benefits: BenefitsContext): Detection[] {
    const detections: Detection[] = [];

    if (!benefits.oopMax?.individual) return detections;

    const totalPatientResp = lineItems.reduce((sum, item) => sum + (item.patientResp || 0), 0);
    const oopMaxMet = benefits.oopMax.met || 0;
    const oopMaxRemaining = Math.max(0, benefits.oopMax.individual - oopMaxMet);

    // If patient responsibility exceeds remaining OOP max, there may be an error
    if (totalPatientResp > oopMaxRemaining && oopMaxRemaining > 0) {
      const excessAmount = totalPatientResp - oopMaxRemaining;

      detections.push({
        detectionId: `oop_max_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        category: 'BenefitsMath',
        severity: 'high',
        explanation: `Out-of-pocket maximum protection may apply. Patient charged $${(totalPatientResp / 100).toFixed(2)} but only $${(oopMaxRemaining / 100).toFixed(2)} remaining in annual OOP max.`,
        mathDelta: {
          expected: Math.min(totalPatientResp, oopMaxRemaining),
          observed: totalPatientResp,
          breakdown: {
            oopMaxAnnual: benefits.oopMax.individual,
            oopMaxMet: oopMaxMet,
            oopMaxRemaining: oopMaxRemaining,
            excessCharged: excessAmount
          }
        },
        evidence: {
          lineRefs: lineItems.map(item => item.lineId),
          snippets: [
            `Annual OOP max: $${(benefits.oopMax.individual / 100).toFixed(2)}`,
            `OOP max met this year: $${(oopMaxMet / 100).toFixed(2)}`,
            `Total patient responsibility: $${(totalPatientResp / 100).toFixed(2)}`
          ]
        },
        suggestedQuestions: [
          'Has the out-of-pocket maximum been reached this plan year?',
          'Are all family members\' expenses counted toward the family OOP max?',
          'Were in-network rates used for OOP max calculations?'
        ],
        policyCitations: [{
          title: 'ACA Out-of-Pocket Maximum Requirements',
          citation: 'ACA Section 1302(c), 45 CFR 156.130',
          authority: 'Federal'
        }],
        confidence: 90
      });
    }

    return detections;
  }

  private checkNetworkAccuracy(lineItems: LineItem[], documents: DocumentMeta[], benefits: BenefitsContext): Detection[] {
    const detections: Detection[] = [];

    if (benefits.network === 'Unknown') return detections;

    // Analyze allowed amounts vs charges to infer network status
    lineItems.forEach(item => {
      if (item.charge && item.allowed) {
        const allowedRatio = item.allowed / item.charge;

        // In-network typically has higher allowed ratios (60-90%)
        // Out-of-network typically has lower allowed ratios (30-60%)
        if (benefits.network === 'IN' && allowedRatio < 0.5) {
          detections.push({
            detectionId: `network_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            category: 'BenefitsMath',
            severity: 'warn',
            explanation: `Network status discrepancy for ${item.code?.value}. Claimed as in-network but allowed amount (${(allowedRatio * 100).toFixed(0)}% of charges) suggests out-of-network rates.`,
            mathDelta: {
              expected: Math.round(item.charge * 0.75), // Expected in-network allowed
              observed: item.allowed,
              breakdown: {
                chargedAmount: item.charge,
                allowedRatio: Math.round(allowedRatio * 100)
              }
            },
            evidence: {
              lineRefs: [item.lineId],
              snippets: [
                `Charged: $${(item.charge / 100).toFixed(2)}`,
                `Allowed: $${(item.allowed / 100).toFixed(2)}`,
                `Ratio: ${(allowedRatio * 100).toFixed(0)}%`
              ]
            },
            suggestedQuestions: [
              'Was this provider actually in-network at time of service?',
              'Are there specific contract rates that differ from standard in-network rates?'
            ],
            policyCitations: [{
              title: 'Provider Network Adequacy Standards',
              citation: 'ACA Section 1311(c)(1), 45 CFR 156.230',
              authority: 'Federal'
            }],
            confidence: 70
          });
        }
      }
    });

    return detections;
  }
}