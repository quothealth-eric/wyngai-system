import { Detection, DocumentMeta, LineItem, UnifiedCaseInput, BenefitsContext, PolicyCitation } from '@/types/analyzer';

export class ComprehensiveDetectionEngine {
  public async runAllDetections(
    lineItems: LineItem[],
    documents: DocumentMeta[],
    caseInput: UnifiedCaseInput
  ): Promise<Detection[]> {
    console.log('🔍 Running comprehensive detection rules...');

    const detections: Detection[] = [];

    // Run all detection rules
    detections.push(...this.detectDuplicateCharges(lineItems));
    detections.push(...this.detectUnbundling(lineItems));
    detections.push(...this.detectModifierErrors(lineItems));
    detections.push(...this.detectFacilityFees(lineItems, documents));
    detections.push(...this.detectNSAAncillary(lineItems, documents, caseInput));
    detections.push(...this.detectNSAEmergency(lineItems, documents, caseInput));
    detections.push(...this.detectPreventiveServices(lineItems));
    detections.push(...this.detectGlobalSurgery(lineItems));
    detections.push(...this.detectDrugUnits(lineItems));
    detections.push(...this.detectTherapyUnits(lineItems));
    detections.push(...this.detectTimelyFiling(documents));
    detections.push(...this.detectCOBIssues(lineItems, documents));
    detections.push(...this.detectDemographicMismatch(documents));
    detections.push(...this.detectMathErrors(lineItems));
    detections.push(...this.detectEOBZeroStillBilled(lineItems, documents));
    detections.push(...this.detectNonProviderFees(lineItems));
    detections.push(...this.detectObsVsInpatient(lineItems, documents));
    detections.push(...this.detectMissingItemized(lineItems, documents));
    detections.push(...this.detectGroundAmbulance(lineItems));
    detections.push(...this.detectProfTechSplit(lineItems));

    console.log(`✅ Detection complete: ${detections.length} issues found`);
    return detections.filter(d => d !== null);
  }

  private detectDuplicateCharges(lineItems: LineItem[]): Detection[] {
    const detections: Detection[] = [];
    const codeMap = new Map<string, LineItem[]>();

    // Group by code and date
    lineItems.forEach(item => {
      if (item.code?.value && item.dos) {
        const key = `${item.code.value}-${item.dos}`;
        if (!codeMap.has(key)) codeMap.set(key, []);
        codeMap.get(key)!.push(item);
      }
    });

    // Check for duplicates
    codeMap.forEach((items, key) => {
      if (items.length > 1) {
        const totalCharge = items.reduce((sum, item) => sum + (item.charge || 0), 0);
        detections.push({
          detectionId: `dup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          category: 'Duplicate',
          severity: 'high',
          explanation: `Duplicate charges detected for ${items[0].code?.value} on ${items[0].dos}. Same procedure code billed ${items.length} times.`,
          mathDelta: {
            expected: items[0].charge || 0,
            observed: totalCharge,
            breakdown: { duplicateCount: items.length }
          },
          evidence: {
            lineRefs: items.map(item => item.lineId),
            snippets: items.map(item => item.raw || `${item.code?.value} - $${((item.charge || 0) / 100).toFixed(2)}`)
          },
          suggestedQuestions: [
            'Were these procedures performed at different times during the same visit?',
            'Is there documentation supporting multiple units or bilateral procedures?'
          ],
          policyCitations: [{
            title: 'CMS-1500 Duplicate Billing Guidelines',
            citation: 'Medicare Claims Processing Manual, Chapter 23',
            authority: 'CMS'
          }],
          confidence: 90
        });
      }
    });

    return detections;
  }

  private detectUnbundling(lineItems: LineItem[]): Detection[] {
    const detections: Detection[] = [];

    // Common unbundling scenarios
    const bundledPairs = [
      { parent: '99213', components: ['36415'], description: 'Office visit includes routine venipuncture' },
      { parent: '93000', components: ['93005', '93010'], description: 'Complete EKG includes interpretation and technical' }
    ];

    bundledPairs.forEach(bundle => {
      const parentItem = lineItems.find(item => item.code?.value === bundle.parent);
      const componentItems = lineItems.filter(item => bundle.components.includes(item.code?.value || ''));

      if (parentItem && componentItems.length > 0) {
        const excessCharge = componentItems.reduce((sum, item) => sum + (item.charge || 0), 0);

        detections.push({
          detectionId: `unbundle_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          category: 'Unbundling',
          severity: 'high',
          explanation: `Potential unbundling detected: ${bundle.description}. Components billed separately when included in comprehensive service.`,
          mathDelta: {
            expected: 0,
            observed: excessCharge,
            breakdown: { unbundledComponents: componentItems.map(i => i.code?.value) }
          },
          evidence: {
            lineRefs: [parentItem.lineId, ...componentItems.map(i => i.lineId)],
            snippets: [`Primary: ${parentItem.code?.value}`, ...componentItems.map(i => `Component: ${i.code?.value}`)]
          },
          suggestedQuestions: [
            'Was the component service performed separately and documented?',
            'Does the documentation support billing both services?'
          ],
          policyCitations: [{
            title: 'NCCI Procedure-to-Procedure Edits',
            citation: 'CMS National Correct Coding Initiative',
            authority: 'CMS'
          }],
          confidence: 85
        });
      }
    });

    return detections;
  }

  private detectModifierErrors(lineItems: LineItem[]): Detection[] {
    const detections: Detection[] = [];

    lineItems.forEach(item => {
      if (item.modifiers && item.modifiers.length > 0) {
        // Check for inappropriate modifier usage
        const code = item.code?.value;
        const modifiers = item.modifiers;

        // Example: 25 modifier with evaluation codes
        if (modifiers.includes('25') && !code?.match(/^99[0-9]{3}$/)) {
          detections.push({
            detectionId: `mod_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            category: 'Modifier',
            severity: 'warn',
            explanation: `Modifier 25 applied to ${code} may be inappropriate. This modifier is typically used with evaluation and management codes.`,
            evidence: {
              lineRefs: [item.lineId],
              snippets: [`${code} with modifier ${modifiers.join(', ')}`]
            },
            suggestedQuestions: [
              'Was a significant, separately identifiable service performed?',
              'Is documentation available to support modifier 25?'
            ],
            policyCitations: [{
              title: 'CMS Modifier 25 Guidelines',
              citation: 'Medicare Claims Processing Manual, Chapter 12',
              authority: 'CMS'
            }],
            confidence: 75
          });
        }
      }
    });

    return detections;
  }

  private detectFacilityFees(lineItems: LineItem[], documents: DocumentMeta[]): Detection[] {
    const detections: Detection[] = [];

    // Look for facility fee charges
    lineItems.forEach(item => {
      if (item.description?.toLowerCase().includes('facility') ||
          item.revenueCode?.startsWith('0') ||
          item.code?.value?.startsWith('C')) {

        detections.push({
          detectionId: `facility_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          category: 'FacilityFee',
          severity: 'info',
          explanation: `Facility fee detected: ${item.description || item.code?.value}. Verify if patient received clear notice of facility fee as required.`,
          evidence: {
            lineRefs: [item.lineId],
            snippets: [item.raw || `${item.code?.value} - $${((item.charge || 0) / 100).toFixed(2)}`]
          },
          suggestedQuestions: [
            'Was the patient notified of facility fees before service?',
            'Was the service provided in a hospital outpatient setting?'
          ],
          policyCitations: [{
            title: 'Hospital Outpatient Price Transparency',
            citation: 'CMS-1717-F Hospital Price Transparency Rule',
            authority: 'CMS'
          }],
          confidence: 80
        });
      }
    });

    return detections;
  }

  private detectNSAAncillary(lineItems: LineItem[], documents: DocumentMeta[], caseInput: UnifiedCaseInput): Detection[] {
    const detections: Detection[] = [];

    // Check for NSA-protected ancillary services
    const ancillaryServices = ['anesthesia', 'pathology', 'radiology', 'emergency medicine'];
    const nsaTags = caseInput.narrative?.tags || [];

    if (nsaTags.includes('anesthesia') || nsaTags.includes('surpriseBill') || caseInput.inferred?.nsaCandidate) {
      lineItems.forEach(item => {
        const description = item.description?.toLowerCase() || '';

        if (description.includes('anesthesia') ||
            item.code?.value?.match(/^0[0-9]{4}$/) || // Anesthesia codes
            description.includes('pathology') ||
            description.includes('radiology')) {

          detections.push({
            detectionId: `nsa_anc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            category: 'NSA_Ancillary',
            severity: 'high',
            explanation: `No Surprises Act protection may apply. Ancillary service (${item.description}) at in-network facility may be subject to NSA billing protections.`,
            mathDelta: {
              expected: item.allowed || Math.floor((item.charge || 0) * 0.7),
              observed: item.charge || 0,
              breakdown: { nsaProtectionApplies: true }
            },
            evidence: {
              lineRefs: [item.lineId],
              snippets: [item.raw || `${item.code?.value} - ${item.description}`]
            },
            suggestedQuestions: [
              'Was this service provided by an out-of-network provider at an in-network facility?',
              'Did the patient receive required NSA notice and consent?'
            ],
            policyCitations: [{
              title: 'No Surprises Act — Facility-based Ancillary Services',
              citation: '42 USC 300gg-111, 45 CFR 149.410',
              authority: 'Federal'
            }],
            confidence: 85
          });
        }
      });
    }

    return detections;
  }

  private detectNSAEmergency(lineItems: LineItem[], documents: DocumentMeta[], caseInput: UnifiedCaseInput): Detection[] {
    const detections: Detection[] = [];

    if (caseInput.inferred?.emergency || caseInput.narrative?.tags?.includes('ER')) {
      // Emergency services should be covered at in-network rate
      const totalCharged = lineItems.reduce((sum, item) => sum + (item.charge || 0), 0);
      const estimatedInNetworkCost = Math.floor(totalCharged * 0.6); // Estimate 60% of charges

      detections.push({
        detectionId: `nsa_er_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        category: 'NSA_ER',
        severity: 'high',
        explanation: 'Emergency services detected. No Surprises Act requires emergency care to be covered at in-network rates regardless of provider network status.',
        mathDelta: {
          expected: estimatedInNetworkCost,
          observed: totalCharged,
          breakdown: { emergencyServices: true, nsaApplies: true }
        },
        evidence: {
          lineRefs: lineItems.map(item => item.lineId),
          snippets: ['Emergency department services subject to NSA protection']
        },
        suggestedQuestions: [
          'Was this emergency care provided by an out-of-network provider?',
          'Did insurance apply in-network benefits as required by NSA?'
        ],
        policyCitations: [{
          title: 'No Surprises Act — Emergency Services',
          citation: '42 USC 300gg-111, 45 CFR 149.110',
          authority: 'Federal'
        }],
        confidence: 95
      });
    }

    return detections;
  }

  private detectPreventiveServices(lineItems: LineItem[]): Detection[] {
    const detections: Detection[] = [];

    // ACA preventive services should be covered at 100%
    const preventiveCodes = ['99401', '99402', 'G0439', 'G0444', '81025', '82270'];

    lineItems.forEach(item => {
      if (preventiveCodes.includes(item.code?.value || '') && (item.patientResp || 0) > 0) {
        detections.push({
          detectionId: `prev_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          category: 'Preventive',
          severity: 'high',
          explanation: `ACA preventive service ${item.code?.value} should be covered at 100% with no patient cost-sharing when provided by in-network provider.`,
          mathDelta: {
            expected: 0,
            observed: item.patientResp || 0,
            breakdown: { preventiveService: true, acaProtection: true }
          },
          evidence: {
            lineRefs: [item.lineId],
            snippets: [`${item.code?.value} - Patient charged $${((item.patientResp || 0) / 100).toFixed(2)}`]
          },
          suggestedQuestions: [
            'Was this service provided by an in-network provider?',
            'Was the service coded as preventive rather than diagnostic?'
          ],
          policyCitations: [{
            title: 'ACA Preventive Services Coverage',
            citation: '42 USC 300gg-13, 45 CFR 147.130',
            authority: 'Federal'
          }],
          confidence: 90
        });
      }
    });

    return detections;
  }

  private detectGlobalSurgery(lineItems: LineItem[]): Detection[] {
    const detections: Detection[] = [];

    // Check for services that might be included in global surgery package
    const surgicalCodes = lineItems.filter(item =>
      item.code?.value?.match(/^[0-9]{5}$/) &&
      parseInt(item.code.value) >= 10000 &&
      parseInt(item.code.value) <= 69999
    );

    const eAndMCodes = lineItems.filter(item =>
      item.code?.value?.match(/^99[0-9]{3}$/)
    );

    if (surgicalCodes.length > 0 && eAndMCodes.length > 0) {
      // Check if E&M services are within global period
      surgicalCodes.forEach(surgery => {
        eAndMCodes.forEach(visit => {
          if (surgery.dos && visit.dos) {
            const surgeryDate = new Date(surgery.dos);
            const visitDate = new Date(visit.dos);
            const daysDiff = Math.abs((visitDate.getTime() - surgeryDate.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDiff <= 90) { // Assume 90-day global period
              detections.push({
                detectionId: `global_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                category: 'GlobalSurgery',
                severity: 'warn',
                explanation: `Evaluation and management service ${visit.code?.value} may be included in global surgery package for ${surgery.code?.value}. Service within ${Math.round(daysDiff)} days of surgery.`,
                mathDelta: {
                  expected: 0,
                  observed: visit.charge || 0,
                  breakdown: { globalPeriodDays: Math.round(daysDiff) }
                },
                evidence: {
                  lineRefs: [surgery.lineId, visit.lineId],
                  snippets: [`Surgery: ${surgery.code?.value} on ${surgery.dos}`, `Visit: ${visit.code?.value} on ${visit.dos}`]
                },
                suggestedQuestions: [
                  'Was the E&M service unrelated to the surgical procedure?',
                  'Is there documentation of a separate, significant service?'
                ],
                policyCitations: [{
                  title: 'Medicare Global Surgery Rules',
                  citation: 'Medicare Claims Processing Manual, Chapter 12',
                  authority: 'CMS'
                }],
                confidence: 75
              });
            }
          }
        });
      });
    }

    return detections;
  }

  // Placeholder implementations for remaining detection methods
  private detectDrugUnits(lineItems: LineItem[]): Detection[] { return []; }
  private detectTherapyUnits(lineItems: LineItem[]): Detection[] { return []; }
  private detectTimelyFiling(documents: DocumentMeta[]): Detection[] { return []; }
  private detectCOBIssues(lineItems: LineItem[], documents: DocumentMeta[]): Detection[] { return []; }
  private detectDemographicMismatch(documents: DocumentMeta[]): Detection[] { return []; }
  private detectMathErrors(lineItems: LineItem[]): Detection[] { return []; }
  private detectEOBZeroStillBilled(lineItems: LineItem[], documents: DocumentMeta[]): Detection[] { return []; }
  private detectNonProviderFees(lineItems: LineItem[]): Detection[] { return []; }
  private detectObsVsInpatient(lineItems: LineItem[], documents: DocumentMeta[]): Detection[] { return []; }
  private detectMissingItemized(lineItems: LineItem[], documents: DocumentMeta[]): Detection[] { return []; }
  private detectGroundAmbulance(lineItems: LineItem[]): Detection[] { return []; }
  private detectProfTechSplit(lineItems: LineItem[]): Detection[] { return []; }
}