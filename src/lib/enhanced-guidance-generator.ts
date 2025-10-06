import { Detection, DocumentMeta, BenefitsContext, Guidance, NextAction, ScriptTemplate, AppealLetter } from '@/types/analyzer';

export class EnhancedGuidanceGenerator {
  public generateGuidance(detections: Detection[], documents: DocumentMeta[], benefits?: BenefitsContext): Guidance {
    console.log('📋 Generating enhanced guidance and scripts...');

    const phoneScripts = this.generatePhoneScripts(detections, documents, benefits);
    const appealLetters = this.generateAppealLetters(detections, documents, benefits);

    return {
      phoneScripts,
      appealLetters
    };
  }

  public generateNextActions(detections: Detection[], documents: DocumentMeta[]): NextAction[] {
    console.log('📋 Generating next action items...');

    const actions: NextAction[] = [];

    // Time-sensitive actions first
    documents.forEach(doc => {
      if (doc.appeal?.deadlineDateISO) {
        const deadline = new Date(doc.appeal.deadlineDateISO);
        const now = new Date();
        const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntil > 0 && daysUntil <= 180) {
          actions.push({
            label: `Submit appeal before deadline (${daysUntil} days remaining)`,
            dueDateISO: doc.appeal.deadlineDateISO
          });
        }
      }
    });

    // Detection-specific actions
    detections.forEach(detection => {
      switch (detection.category) {
        case 'NSA_Ancillary':
        case 'NSA_ER':
          actions.push({
            label: 'Contact insurance to apply No Surprises Act protections'
          });
          break;
        case 'Preventive':
          actions.push({
            label: 'Request ACA preventive services review and refund'
          });
          break;
        case 'Duplicate':
          actions.push({
            label: 'Request duplicate charge investigation and refund'
          });
          break;
        case 'BenefitsMath':
          actions.push({
            label: 'Request benefits calculation review and correction'
          });
          break;
      }
    });

    // General follow-up actions
    if (detections.length > 0) {
      actions.push({
        label: 'Gather supporting documentation for identified issues'
      });

      if (!documents.some(d => d.docType === 'EOB') || !documents.some(d => d.docType === 'BILL')) {
        actions.push({
          label: 'Request missing documentation (EOB or itemized bill)'
        });
      }
    }

    // Limit to top 5 most important actions
    return actions.slice(0, 5);
  }

  private generatePhoneScripts(detections: Detection[], documents: DocumentMeta[], benefits?: BenefitsContext): ScriptTemplate[] {
    const scripts: ScriptTemplate[] = [];

    // High-priority detection scripts
    const highPriorityDetections = detections.filter(d => d.severity === 'high');

    if (highPriorityDetections.some(d => d.category === 'NSA_ER')) {
      scripts.push({
        title: 'No Surprises Act - Emergency Services',
        body: `Hello, I'm calling about claim {claimId} for emergency services received on {serviceDate}.

I believe the No Surprises Act applies to this claim. Under federal law, emergency services must be covered at in-network rates regardless of the provider's network status.

The services were:
{serviceDetails}

I'm requesting that you:
1. Reprocess this claim using in-network benefits
2. Refund any excess patient responsibility
3. Provide written confirmation of the corrected benefits

Can you please review this claim under No Surprises Act requirements?

📋 Professionally prepared by Wyng specialists at Quot Health Inc.`
      });
    }

    if (highPriorityDetections.some(d => d.category === 'NSA_Ancillary')) {
      scripts.push({
        title: 'No Surprises Act - Ancillary Services',
        body: `Hello, I'm calling about claim {claimId} for services received at {facilityName} on {serviceDate}.

I believe this involves facility-based ancillary services covered under the No Surprises Act. The out-of-network provider was at an in-network facility, which triggers NSA protections.

The ancillary services were:
{ancillaryServices}

Under 45 CFR 149.410, these services should be covered at in-network rates. I'm requesting:
1. Claim reprocessing under NSA guidelines
2. Patient responsibility limited to in-network amounts
3. Written documentation of the corrected benefits

Can you transfer me to your NSA compliance department?

📋 Professionally prepared by Wyng specialists at Quot Health Inc.`
      });
    }

    if (highPriorityDetections.some(d => d.category === 'Preventive')) {
      scripts.push({
        title: 'ACA Preventive Services',
        body: `Hello, I'm calling about claim {claimId} for preventive services.

The following services should be covered at 100% under the Affordable Care Act:
{preventiveServices}

These are federally mandated preventive services that require no cost-sharing when provided by in-network providers. I was incorrectly charged {patientAmount}.

I'm requesting:
1. Claim reprocessing to remove all patient cost-sharing
2. Refund of {patientAmount} already paid
3. Confirmation that future preventive services will be covered correctly

Can you please review this under ACA preventive services requirements?

📋 Professionally prepared by Wyng specialists at Quot Health Inc.`
      });
    }

    // Benefits math error script
    if (detections.some(d => d.category === 'BenefitsMath')) {
      scripts.push({
        title: 'Benefits Calculation Review',
        body: `Hello, I'm calling about claim {claimId} to request a benefits calculation review.

Based on my plan benefits, I believe there are calculation errors:
- Plan: {planType}
- Deductible: {deductible} (met: {deductibleMet})
- Coinsurance: {coinsurance}%
- Out-of-pocket max: {oopMax}

The calculation discrepancies I found:
{mathDiscrepancies}

I'm requesting:
1. Detailed benefits calculation worksheet
2. Claim reprocessing with correct math
3. Refund of any overpayment

Can you provide a detailed breakdown of how my benefits were applied?

📋 Professionally prepared by Wyng specialists at Quot Health Inc.`
      });
    }

    // General inquiry script
    scripts.push({
      title: 'General Claim Inquiry',
      body: `Hello, I'm calling about claim {claimId} for services on {serviceDate}.

I have questions about how my benefits were applied and would like to request a claim review.

My questions include:
{detectedIssues}

Could you please:
1. Provide a detailed explanation of benefits calculation
2. Review the claim for any processing errors
3. Transfer me to a supervisor if reprocessing is needed

I have all my documentation ready and can provide additional information if needed.

📋 Professionally prepared by Wyng specialists at Quot Health Inc.`
    });

    return scripts;
  }

  private generateAppealLetters(detections: Detection[], documents: DocumentMeta[], benefits?: BenefitsContext): AppealLetter[] {
    const letters: AppealLetter[] = [];

    // Formal appeal letter for high-severity issues
    if (detections.some(d => d.severity === 'high')) {
      letters.push({
        title: 'Formal Claim Appeal',
        body: `[Date]

[Insurance Company Name]
[Appeal Address]

Re: Claim Appeal - Member: {memberName}
Claim Number: {claimId}
Date of Service: {serviceDate}
Provider: {providerName}

Dear Appeals Review Team,

I am formally appealing your denial/reduction of benefits for the above-referenced claim. Based on my review, I believe the claim was processed incorrectly for the following reasons:

GROUNDS FOR APPEAL:

{detectedIssuesDetailed}

SUPPORTING EVIDENCE:

I have identified specific policy violations and calculation errors that require claim reprocessing:

{evidenceList}

REQUESTED RESOLUTION:

I respectfully request that you:
1. Reverse the original claims decision
2. Reprocess the claim with correct benefits application
3. Issue payment for the corrected amount
4. Provide written confirmation of the corrected benefits

REGULATORY REFERENCES:

{policyCitations}

I have attached all supporting documentation including:
- Original EOB and billing statements
- Plan benefit summaries
- Detailed analysis of calculation errors
- Applicable regulatory citations

Please acknowledge receipt of this appeal within 5 business days and provide your written decision within the timeframes required by law.

I look forward to your prompt review and correction of this matter.

Sincerely,

{memberName}
Member ID: {memberId}

📋 Professionally prepared by Wyng specialists at Quot Health Inc.

Attachments: Supporting documentation and analysis`,
        attachments: [
          'Original EOB and billing statements',
          'Plan summary of benefits',
          'Detailed claims analysis',
          'Regulatory citations and policy references'
        ]
      });
    }

    // NSA-specific appeal letter
    if (detections.some(d => d.category.startsWith('NSA_'))) {
      letters.push({
        title: 'No Surprises Act Appeal',
        body: `[Date]

[Insurance Company Name]
[Appeal Address]

Re: No Surprises Act Violation - Claim {claimId}
Member: {memberName}, Member ID: {memberId}
Date of Service: {serviceDate}

Dear NSA Compliance Team,

I am filing this appeal under the No Surprises Act (42 USC 300gg-111) regarding claim {claimId}.

NSA VIOLATION:

{nsaViolationDetails}

LEGAL REQUIREMENTS:

Under the No Surprises Act and implementing regulations (45 CFR 149), you are required to:

1. Cover emergency services at in-network rates regardless of provider network status
2. Apply in-network cost-sharing for facility-based ancillary services
3. Process claims using the recognized amount or negotiated rate
4. Provide timely resolution of billing disputes

CLAIM CORRECTION REQUIRED:

{correctionDetails}

REQUESTED RESOLUTION:

1. Immediate reprocessing under NSA guidelines
2. Application of in-network benefits and cost-sharing
3. Refund of excess patient responsibility: {refundAmount}
4. Written confirmation of NSA compliance

This matter requires urgent attention as it involves federal patient protection violations. I expect resolution within 30 days as required by law.

Sincerely,

{memberName}

📋 Professionally prepared by Wyng specialists at Quot Health Inc.`
      });
    }

    return letters;
  }
}