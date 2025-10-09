// @ts-nocheck
import { PolicyCitation } from '@/types/common';

// Temporary placeholders for missing types
interface ChatProcessingContext {
  [key: string]: any;
}

interface ChatDetection {
  [key: string]: any;
}

interface ExtractedLineItem {
  [key: string]: any;
}

export class CommonIssueDetectors {

  public async detectAllIssues(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // Run all detector methods
    detections.push(...await this.detectNSAEmergencyAndAncillary(context));
    detections.push(...await this.detectPreventiveVsDiagnostic(context));
    detections.push(...await this.detectFacilityFees(context));
    detections.push(...await this.detectGlobalSurgery(context));
    detections.push(...await this.detectDrugUnits(context));
    detections.push(...await this.detectTherapyTimeUnits(context));
    detections.push(...await this.detectTimelyFiling(context));
    detections.push(...await this.detectCOBNotApplied(context));
    detections.push(...await this.detectEOBZeroButBilled(context));
    detections.push(...await this.detectObservationVsInpatient(context));
    detections.push(...await this.detectItemizedBillMissing(context));
    detections.push(...await this.detectBalanceBilling(context));
    detections.push(...await this.detectAmbulanceRules(context));

    return detections.filter(d => d !== null) as ChatDetection[];
  }

  private async detectNSAEmergencyAndAncillary(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // Check for emergency setting (POS 23)
    const hasEmergencyPOS = this.hasLineItemWithPOS(context, '23');
    const hasAncillaryServices = context.case.inferred?.ancillary?.length;
    const isEmergency = context.case.inferred?.emergency;

    if ((hasEmergencyPOS || isEmergency) && hasAncillaryServices) {
      // Check for potential OON ancillary at in-network facility
      const hasBalanceCharges = this.hasUnexpectedBalanceCharges(context);

      if (hasBalanceCharges) {
        detections.push({
          category: "NSA Emergency & Ancillary Protection",
          severity: "high",
          explanation: "Emergency services with out-of-network ancillary providers (anesthesia, pathology, radiology) are protected under the No Surprises Act. You should only pay in-network cost-sharing amounts.",
          evidence: {
            snippets: [
              `Emergency service detected: ${isEmergency ? 'Yes' : 'POS 23 found'}`,
              `Ancillary services: ${context.case.inferred?.ancillary?.join(', ')}`,
              "Unexpected balance charges detected"
            ],
            pages: [1]
          },
          policyCitations: [
            {
              title: "NSA — Emergency Services Balance Billing Prohibition",
              authority: "Federal",
              citation: "45 CFR § 149.110"
            },
            {
              title: "NSA — Ancillary Provider Balance Billing Prohibition",
              authority: "Federal",
              citation: "45 CFR § 149.120"
            }
          ]
        });
      }
    }

    // Check for facility-based ancillary at in-network facility
    const hasInNetworkFacility = this.detectInNetworkFacility(context);
    if (hasInNetworkFacility && hasAncillaryServices) {
      detections.push({
        category: "NSA Facility-Based Ancillary Protection",
        severity: "warn",
        explanation: "Ancillary services provided at in-network facilities by out-of-network providers are protected under the No Surprises Act for non-emergency services when you didn't have the ability to choose.",
        evidence: {
          snippets: [
            "In-network facility detected",
            `Ancillary services: ${context.case.inferred?.ancillary?.join(', ')}`
          ]
        },
        policyCitations: [
          {
            title: "NSA — Non-Emergency Services at In-Network Facilities",
            authority: "Federal",
            citation: "45 CFR § 149.120"
          }
        ]
      });
    }

    return detections;
  }

  private async detectPreventiveVsDiagnostic(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // Look for preventive codes with charges
    const preventiveCodes = ['G0439', 'G0442', 'G0443', 'G0444', 'G0445', 'G0446', 'G0447', 'G0448'];
    const preventiveZCodes = context.extractedLineItems.forEach((items: any, artifactId: any) => {
      const preventiveItems = items.filter((item: any) =>
        preventiveCodes.some(code => item.code?.value.includes(code)) ||
        (item.code?.value.startsWith('Z') && ['Z00', 'Z01', 'Z12', 'Z13'].some(z => item.code?.value.startsWith(z)))
      );

      preventiveItems.forEach(item => {
        const hasCharges = item.charges?.patientResp?.amount && item.charges.patientResp.amount > 0;
        const hasModifier33 = item.modifiers?.some(mod => mod.value === '33');

        if (hasCharges && !hasModifier33) {
          detections.push({
            category: "Preventive Care Billing Error",
            severity: "warn",
            explanation: "Preventive care services should be covered at 100% without cost-sharing when provided by in-network providers. This appears to be billed incorrectly.",
            evidence: {
              lineRefs: [item.lineId],
              snippets: [
                `Code ${item.code?.value}: $${(item.charges?.patientResp?.amount || 0) / 100}`,
                "Missing preventive modifier (33) or incorrect coding"
              ]
            },
            policyCitations: [
              {
                title: "ACA — Preventive Services Cost-Sharing Prohibition",
                authority: "Federal",
                citation: "42 USC § 18022(b)(1)"
              },
              {
                title: "IRS — Preventive Care Safe Harbor",
                authority: "Federal",
                citation: "IRS Notice 2019-45"
              }
            ]
          });
        }
      });
    });

    return detections;
  }

  private async detectFacilityFees(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // Look for hospital-owned clinic split billing
    const facilityFeeCodes = this.findLineItemsWithCodes(context, ['G0463', 'G0464', 'G0465']);
    const hasOfficeVisit = this.hasLineItemsWithCodePattern(context, /^992\d{2}$/);

    if (facilityFeeCodes.length > 0 && hasOfficeVisit) {
      detections.push({
        category: "Hospital Facility Fee",
        severity: "info",
        explanation: "Hospital-owned clinics can charge both professional (doctor) and facility fees. The facility fee helps cover overhead costs like nursing staff and equipment.",
        evidence: {
          lineRefs: facilityFeeCodes.map(item => item.lineId),
          snippets: [
            `Facility fee codes found: ${facilityFeeCodes.map(item => item.code?.value).join(', ')}`,
            "Office visit also billed"
          ]
        },
        policyCitations: [
          {
            title: "CMS — Hospital Outpatient Facility Fees",
            authority: "CMS",
            citation: "42 CFR § 419.2"
          }
        ]
      });
    }

    return detections;
  }

  private async detectGlobalSurgery(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // Look for E/M services within global surgery period
    const surgicalCodes = this.findLineItemsWithCodePattern(context, /^(1|2|3|4)\d{4}$/);
    const emCodes = this.findLineItemsWithCodePattern(context, /^992\d{2}$/);

    if (surgicalCodes.length > 0 && emCodes.length > 0) {
      // Check if E/M codes have modifier 25 or are within global period
      const emWithoutModifier25 = emCodes.filter(item =>
        !item.modifiers?.some(mod => mod.value === '25')
      );

      if (emWithoutModifier25.length > 0) {
        detections.push({
          category: "Global Surgery Period Issue",
          severity: "warn",
          explanation: "Evaluation and Management (E/M) services on the same day as surgery typically require modifier 25 to indicate a separately identifiable service. Without this modifier, the E/M may be included in the surgical fee.",
          evidence: {
            lineRefs: [...surgicalCodes.map(item => item.lineId), ...emWithoutModifier25.map(item => item.lineId)],
            snippets: [
              `Surgical codes: ${surgicalCodes.map(item => item.code?.value).join(', ')}`,
              `E/M codes without modifier 25: ${emWithoutModifier25.map(item => item.code?.value).join(', ')}`
            ]
          },
          policyCitations: [
            {
              title: "CMS — Global Surgery Data Reporting",
              authority: "CMS",
              citation: "42 CFR § 414.26"
            },
            {
              title: "NCCI — Global Surgery Rules",
              authority: "CMS",
              citation: "NCCI-Policy-Manual-Ch6"
            }
          ]
        });
      }
    }

    return detections;
  }

  private async detectDrugUnits(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // Look for J-codes with unusual unit quantities
    const jCodes = this.findLineItemsWithCodePattern(context, /^J\d{4}$/);

    jCodes.forEach(item => {
      const units = item.units?.value || 1;
      const code = item.code?.value || '';

      // Flag potentially high unit counts
      if (units > 100) {
        detections.push({
          category: "High Drug Unit Count",
          severity: "warn",
          explanation: `The unit count for drug code ${code} appears high (${units} units). Verify this matches the actual amount administered and dosage.`,
          evidence: {
            lineRefs: [item.lineId],
            snippets: [`${code}: ${units} units`]
          },
          policyCitations: [
            {
              title: "CMS — Drug Administration Billing",
              authority: "CMS",
              citation: "CMS-1500-Instructions"
            }
          ]
        });
      }
    });

    return detections;
  }

  private async detectTherapyTimeUnits(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // Look for therapy codes with time-based units
    const therapyCodes = this.findLineItemsWithCodePattern(context, /^(97\d{3}|929\d{2})$/);

    therapyCodes.forEach(item => {
      const units = item.units?.value || 1;
      const code = item.code?.value || '';

      // Most therapy codes are billed in 15-minute increments
      if (units > 10) { // More than 2.5 hours
        detections.push({
          category: "High Therapy Time Units",
          severity: "info",
          explanation: `Therapy code ${code} shows ${units} units, representing ${units * 15} minutes. Verify this reflects actual therapy time provided.`,
          evidence: {
            lineRefs: [item.lineId],
            snippets: [`${code}: ${units} units (${units * 15} minutes)`]
          },
          policyCitations: [
            {
              title: "CMS — Therapy Services Time-Based Billing",
              authority: "CMS",
              citation: "42 CFR § 414.27"
            }
          ]
        });
      }
    });

    return detections;
  }

  private async detectTimelyFiling(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // Check for timely filing issues in narrative or denial codes
    const narrative = context.case.narrative.text.toLowerCase();
    const hasTimelyFilingMention = /timely.filing|time.limit|filing.deadline/.test(narrative);

    if (hasTimelyFilingMention) {
      detections.push({
        category: "Timely Filing Issue",
        severity: "high",
        explanation: "Timely filing requirements vary by payer but typically range from 90 days to 1 year. Providers must submit claims within these deadlines or risk non-payment.",
        evidence: {
          snippets: ["Timely filing mentioned in narrative"]
        },
        policyCitations: [
          {
            title: "Medicare — Timely Filing Requirements",
            authority: "CMS",
            citation: "42 CFR § 424.44"
          }
        ]
      });
    }

    return detections;
  }

  private async detectCOBNotApplied(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // If user indicates secondary coverage but claims show no coordination
    if (context.case.benefits?.secondaryCoverage) {
      const hasMultiplePayments = context.extractedTotals.size > 1;

      if (!hasMultiplePayments) {
        detections.push({
          category: "Coordination of Benefits Not Applied",
          severity: "warn",
          explanation: "You indicated having secondary insurance, but these documents don't show coordination of benefits. Ensure both insurances have processed the claim.",
          evidence: {
            snippets: ["Secondary coverage indicated", "No evidence of multiple payer processing"]
          },
          policyCitations: [
            {
              title: "NAIC — Coordination of Benefits Model Regulation",
              authority: "StateDOI",
              citation: "NAIC-COB-2020"
            }
          ]
        });
      }
    }

    return detections;
  }

  private async detectEOBZeroButBilled(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // Look for cases where EOB shows $0 patient responsibility but bill shows charges
    context.extractedTotals.forEach((totals, artifactId) => {
      const artifact = context.case.artifacts.find(a => a.artifactId === artifactId);

      if (artifact?.docType === 'EOB' && totals.patientResp?.amount === 0) {
        // Check if there are bills with charges for the same case
        const hasBillsWithCharges = Array.from(context.extractedTotals.entries()).some(([billArtifactId, billTotals]) => {
          const billArtifact = context.case.artifacts.find(a => a.artifactId === billArtifactId);
          return billArtifact?.docType === 'BILL' && billTotals.patientResp?.amount && billTotals.patientResp.amount > 0;
        });

        if (hasBillsWithCharges) {
          detections.push({
            category: "EOB Shows $0 But Bill Has Charges",
            severity: "high",
            explanation: "Your EOB shows $0 patient responsibility, but you received a bill with charges. The provider should not be billing you if insurance shows no patient responsibility.",
            evidence: {
              snippets: ["EOB shows $0 patient responsibility", "Bill shows charges owed"]
            },
            policyCitations: [
              {
                title: "Insurance Contract — Provider Cannot Bill More Than EOB",
                authority: "PayerPolicy",
                citation: "standard-provider-agreement"
              }
            ]
          });
        }
      }
    });

    return detections;
  }

  private async detectObservationVsInpatient(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    const narrative = context.case.narrative.text.toLowerCase();
    const hasObservationMention = /observation|obs status|outpatient status/.test(narrative);
    const hasInpatientExpectation = /admit|admitted|inpatient|hospital stay/.test(narrative);

    if (hasObservationMention && hasInpatientExpectation) {
      detections.push({
        category: "Observation vs Inpatient Status",
        severity: "info",
        explanation: "Observation status is outpatient care and may result in higher costs and different coverage rules compared to inpatient admission. You have rights to notification and appeal if kept on observation status.",
        evidence: {
          snippets: ["Observation status mentioned", "Inpatient admission expected"]
        },
        policyCitations: [
          {
            title: "CMS — Hospital Notification of Observation Status",
            authority: "CMS",
            citation: "42 CFR § 482.13(g)"
          },
          {
            title: "Medicare — Two-Midnight Rule",
            authority: "CMS",
            citation: "42 CFR § 412.3"
          }
        ]
      });
    }

    return detections;
  }

  private async detectItemizedBillMissing(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // Check if user is asking for itemization or has non-itemized bills
    const narrative = context.case.narrative.text.toLowerCase();
    const needsItemization = /itemized|line.item|breakdown|detail|charges.*what/.test(narrative);

    const hasLineItems = Array.from(context.extractedLineItems.values()).some(items => items.length > 0);

    if (needsItemization && !hasLineItems) {
      detections.push({
        category: "Itemized Bill Missing",
        severity: "warn",
        explanation: "You have the right to request an itemized bill showing detailed charges. This helps verify accuracy and understand what services were provided.",
        evidence: {
          snippets: ["Itemization requested", "No line items found in documents"]
        },
        policyCitations: [
          {
            title: "Patient Bill of Rights — Right to Detailed Bill",
            authority: "Federal",
            citation: "42 CFR § 482.13"
          }
        ]
      });
    }

    return detections;
  }

  private async detectBalanceBilling(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    const narrative = context.case.narrative.text.toLowerCase();
    const hasBalanceBillMention = /balance.bill|surprise.bill|more.than.expected|higher.than/.test(narrative);

    if (hasBalanceBillMention || context.case.inferred?.nsaCandidate) {
      detections.push({
        category: "Potential Balance Billing",
        severity: "high",
        explanation: "Balance billing occurs when providers bill you for the difference between their charges and what insurance pays. The No Surprises Act provides protections in many situations.",
        evidence: {
          snippets: hasBalanceBillMention ? ["Balance billing mentioned in narrative"] : ["NSA candidate scenario detected"]
        },
        policyCitations: [
          {
            title: "No Surprises Act — Balance Billing Protections",
            authority: "Federal",
            citation: "45 CFR § 149"
          }
        ]
      });
    }

    return detections;
  }

  private async detectAmbulanceRules(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // Look for ambulance codes
    const ambulanceCodes = this.findLineItemsWithCodePattern(context, /^A0\d{3}$/);

    if (ambulanceCodes.length > 0) {
      detections.push({
        category: "Ambulance Service Rules",
        severity: "info",
        explanation: "Ambulance services have specific coverage rules. Ground ambulance is covered when medically necessary to the nearest appropriate facility. Air ambulance has No Surprises Act protections.",
        evidence: {
          lineRefs: ambulanceCodes.map(item => item.lineId),
          snippets: ambulanceCodes.map(item => `Ambulance code: ${item.code?.value}`)
        },
        policyCitations: [
          {
            title: "Medicare — Ambulance Fee Schedule",
            authority: "CMS",
            citation: "42 CFR § 414.605"
          },
          {
            title: "NSA — Air Ambulance Balance Billing Protection",
            authority: "Federal",
            citation: "45 CFR § 149.130"
          }
        ]
      });
    }

    return detections;
  }

  // Helper methods
  private hasLineItemWithPOS(context: ChatProcessingContext, pos: string): boolean {
    return Array.from(context.extractedLineItems.values()).some(items =>
      items.some(item => item.pos?.code === pos)
    );
  }

  private hasUnexpectedBalanceCharges(context: ChatProcessingContext): boolean {
    return Array.from(context.extractedTotals.values()).some(totals =>
      totals.patientResp?.amount && totals.patientResp.amount > 100000 // $1000+
    );
  }

  private detectInNetworkFacility(context: ChatProcessingContext): boolean {
    // This would normally check against provider networks
    // For now, assume facility is in-network if no clear OON indicators
    return !context.case.narrative.text.toLowerCase().includes('out of network');
  }

  private findLineItemsWithCodes(context: ChatProcessingContext, codes: string[]): ExtractedLineItem[] {
    const items: ExtractedLineItem[] = [];
    context.extractedLineItems.forEach((lineItems) => {
      lineItems.forEach(item => {
        if (item.code?.value && codes.includes(item.code.value)) {
          items.push(item);
        }
      });
    });
    return items;
  }

  private findLineItemsWithCodePattern(context: ChatProcessingContext, pattern: RegExp): ExtractedLineItem[] {
    const items: ExtractedLineItem[] = [];
    context.extractedLineItems.forEach((lineItems) => {
      lineItems.forEach(item => {
        if (item.code?.value && pattern.test(item.code.value)) {
          items.push(item);
        }
      });
    });
    return items;
  }

  private hasLineItemsWithCodePattern(context: ChatProcessingContext, pattern: RegExp): boolean {
    return this.findLineItemsWithCodePattern(context, pattern).length > 0;
  }
}