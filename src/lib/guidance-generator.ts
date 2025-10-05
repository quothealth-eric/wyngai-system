import { Detection, DocumentMeta, ScriptTemplate, AppealLetter, Guidance, NextAction, PolicyCitation, BenefitsContext } from '@/types/analyzer';

export class GuidanceGenerator {
  public generateGuidance(
    detections: Detection[],
    documentMeta: DocumentMeta,
    benefits?: BenefitsContext
  ): Guidance {
    const phoneScripts: ScriptTemplate[] = [];
    const appealLetters: AppealLetter[] = [];

    // Generate scripts and letters based on detection categories
    for (const detection of detections) {
      switch (detection.category) {
        case 'MathError':
        case 'BenefitsMath':
          phoneScripts.push(this.generateMathMismatchScript(detection, documentMeta));
          appealLetters.push(this.generateMathErrorAppealLetter(detection, documentMeta));
          break;

        case 'NSA_Ancillary':
        case 'NSA_ER':
          phoneScripts.push(this.generateNSAScript(detection, documentMeta));
          appealLetters.push(this.generateNSAAppealLetter(detection, documentMeta));
          break;

        case 'Preventive':
          phoneScripts.push(this.generatePreventiveScript(detection, documentMeta));
          appealLetters.push(this.generatePreventiveAppealLetter(detection, documentMeta));
          break;

        case 'Duplicate':
          phoneScripts.push(this.generateDuplicateScript(detection, documentMeta));
          break;

        case 'EOBZeroStillBilled':
          phoneScripts.push(this.generateEOBZeroScript(detection, documentMeta));
          break;

        case 'COB':
          phoneScripts.push(this.generateCOBScript(detection, documentMeta));
          break;

        case 'TimelyFiling':
          phoneScripts.push(this.generateTimelyFilingScript(detection, documentMeta));
          break;
      }
    }

    // Remove duplicates and sort by priority
    const uniqueScripts = this.deduplicateScripts(phoneScripts);
    const uniqueLetters = this.deduplicateLetters(appealLetters);

    return {
      phoneScripts: uniqueScripts,
      appealLetters: uniqueLetters
    };
  }

  public generateNextActions(
    detections: Detection[],
    documentMeta: DocumentMeta
  ): NextAction[] {
    const actions: NextAction[] = [];

    // Appeal deadline (if available)
    if (documentMeta.docType === 'EOB') {
      const appealDeadline = new Date();
      appealDeadline.setDate(appealDeadline.getDate() + 180); // Standard 180-day appeal period

      actions.push({
        label: 'File appeal if needed (within 180 days of EOB date)',
        dueDate: appealDeadline.toISOString().split('T')[0]
      });
    }

    // High-priority actions based on detections
    const hasNSA = detections.some(d => d.category.startsWith('NSA'));
    const hasMathError = detections.some(d => d.category === 'MathError' || d.category === 'BenefitsMath');
    const hasPreventive = detections.some(d => d.category === 'Preventive');

    if (hasNSA) {
      actions.unshift({
        label: 'Contact insurance company about No Surprises Act protections',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 30 days
      });
    }

    if (hasMathError) {
      actions.unshift({
        label: 'Contact provider billing office to verify charges',
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 14 days
      });
    }

    if (hasPreventive) {
      actions.unshift({
        label: 'Request preventive services reprocessing',
        dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 21 days
      });
    }

    // Generic actions
    actions.push({
      label: 'Keep all documentation and correspondence'
    });

    if (detections.length > 0) {
      actions.push({
        label: 'Consider requesting payment plan if amount is correct but unaffordable'
      });
    }

    return actions;
  }

  private generateMathMismatchScript(detection: Detection, documentMeta: DocumentMeta): ScriptTemplate {
    const claimId = documentMeta.claimId || 'N/A';
    const accountId = documentMeta.accountId || 'N/A';
    const serviceDate = documentMeta.serviceDates?.start || 'N/A';

    const expectedAmount = detection.mathDelta?.expected ? `$${(detection.mathDelta.expected / 100).toFixed(2)}` : 'N/A';
    const observedAmount = detection.mathDelta?.observed ? `$${(detection.mathDelta.observed / 100).toFixed(2)}` : 'N/A';

    return {
      title: 'Billing Office Call — Math Mismatch',
      body: `Hi, I'm calling about account #${accountId}${claimId !== 'N/A' ? ` / claim #${claimId}` : ''}.

My EOB for service date ${serviceDate} shows a different patient responsibility amount than what appears on my bill.

According to my EOB and insurance benefits:
- Expected patient responsibility: ${expectedAmount}
- Bill shows: ${observedAmount}

Could you please:
1. Verify the insurance payment posting is correct
2. Check if the deductible and coinsurance calculations are accurate
3. Confirm the network status was processed correctly
4. Provide a corrected statement if there's an error

I have my EOB and benefits information available if you need to reference them.

Thank you for your help in resolving this discrepancy.`
    };
  }

  private generateNSAScript(detection: Detection, documentMeta: DocumentMeta): ScriptTemplate {
    const claimId = documentMeta.claimId || 'N/A';
    const serviceDate = documentMeta.serviceDates?.start || 'N/A';
    const providerName = documentMeta.providerName || 'the provider';

    const isEmergency = detection.category === 'NSA_ER';
    const protectionType = isEmergency ? 'emergency services' : 'facility-based ancillary services';

    return {
      title: `No Surprises Act Protection Call — ${isEmergency ? 'Emergency' : 'Ancillary'} Services`,
      body: `Hi, I'm calling about claim #${claimId} for services received on ${serviceDate} from ${providerName}.

I believe my claim should be protected under the No Surprises Act for ${protectionType}. Based on this federal law, my cost-sharing should be limited to in-network amounts.

${isEmergency ?
  'This was emergency care, and the No Surprises Act protects patients from surprise billing for emergency services regardless of the provider\'s network status.' :
  'This appears to be an ancillary provider at an in-network facility, which should be protected under the facility-based provider provisions of the No Surprises Act.'
}

Could you please:
1. Review this claim for No Surprises Act protections
2. Reprocess with in-network cost-sharing amounts
3. Provide an updated EOB showing the corrected patient responsibility
4. Explain any remaining balance and its basis

I can provide documentation of the ${isEmergency ? 'emergency nature of the care' : 'in-network facility status'} if needed.

Thank you for your assistance with this federally protected claim.`
    };
  }

  private generatePreventiveScript(detection: Detection, documentMeta: DocumentMeta): ScriptTemplate {
    const claimId = documentMeta.claimId || 'N/A';
    const serviceDate = documentMeta.serviceDates?.start || 'N/A';
    const providerName = documentMeta.providerName || 'the provider';

    return {
      title: 'Preventive Services Reprocessing Call',
      body: `Hi, I'm calling about claim #${claimId} for preventive services received on ${serviceDate} from ${providerName}.

This service was intended as preventive care, which should be covered at 100% for in-network providers under the Affordable Care Act. However, I'm being charged a patient responsibility amount.

The service appears to be:
${detection.evidence.snippets?.map(snippet => `- ${snippet}`).join('\n') || '- Preventive care service'}

Could you please:
1. Verify this was coded as preventive rather than diagnostic
2. Confirm the provider is in-network for preventive services
3. Check if any additional non-preventive services were bundled
4. Resubmit with appropriate preventive coding if needed
5. Process at 100% coverage as required by law

If this service was truly preventive and the provider is in-network, there should be no patient cost-sharing under federal law.

Please let me know what documentation you need to reprocess this correctly.`
    };
  }

  private generateDuplicateScript(detection: Detection, documentMeta: DocumentMeta): ScriptTemplate {
    const accountId = documentMeta.accountId || 'N/A';
    const serviceDate = documentMeta.serviceDates?.start || 'N/A';

    return {
      title: 'Duplicate Charges Inquiry Call',
      body: `Hi, I'm calling about account #${accountId} for services on ${serviceDate}.

I noticed what appears to be duplicate charges on my bill:
${detection.evidence.snippets?.map(snippet => `- ${snippet}`).join('\n') || '- Duplicate procedures detected'}

Could you please:
1. Provide an itemized bill showing all services performed
2. Verify that each charge represents a separately performed service
3. Explain why the same procedure appears multiple times
4. Remove any duplicate charges if they're billing errors
5. Provide documentation if multiple procedures were actually necessary

I want to make sure I'm only paying for services that were actually provided.

Thank you for reviewing this with me.`
    };
  }

  private generateEOBZeroScript(detection: Detection, documentMeta: DocumentMeta): ScriptTemplate {
    const accountId = documentMeta.accountId || 'N/A';
    const claimId = documentMeta.claimId || 'N/A';

    return {
      title: 'EOB Shows Zero Responsibility Call',
      body: `Hi, I'm calling about account #${accountId}${claimId !== 'N/A' ? ` / claim #${claimId}` : ''}.

My Explanation of Benefits (EOB) shows $0 patient responsibility for this claim, but I received a bill requesting payment.

Could you please:
1. Check if the insurance payment has been properly posted to my account
2. Verify the EOB amount matches your records
3. Explain any remaining balance and its source
4. Correct the account if the insurance payment wasn't applied properly
5. Provide a corrected statement showing the accurate balance

I have my EOB available and can provide the claim number and payment details if needed.

Please help resolve this discrepancy between the EOB and the bill.`
    };
  }

  private generateCOBScript(detection: Detection, documentMeta: DocumentMeta): ScriptTemplate {
    const claimId = documentMeta.claimId || 'N/A';

    return {
      title: 'Coordination of Benefits Call',
      body: `Hi, I'm calling about claim #${claimId}.

My EOB indicates there may be coordination of benefits issues, suggesting this claim should be submitted to my secondary insurance.

Could you please:
1. Confirm if you have current information for both my primary and secondary insurance
2. Submit this claim to my secondary insurance for processing
3. Explain the coordination of benefits process and timeline
4. Let me know what additional information you need from me
5. Provide an updated statement after secondary processing

I can provide my secondary insurance information if you don't have it on file.

Please let me know the next steps in the coordination process.`
    };
  }

  private generateTimelyFilingScript(detection: Detection, documentMeta: DocumentMeta): ScriptTemplate {
    const accountId = documentMeta.accountId || 'N/A';

    return {
      title: 'Timely Filing Denial Call',
      body: `Hi, I'm calling about account #${accountId}.

I received a denial for timely filing, but I believe the patient should not be responsible for the provider's filing delay.

Could you please:
1. Explain your policy on patient responsibility for timely filing denials
2. Confirm the original submission dates and deadlines
3. Consider writing off this amount as a provider responsibility
4. Provide documentation of your timely filing policies
5. Let me know if there are any appeal options available

In many states, patients are not responsible for provider filing errors. Please review your policies and state regulations.

I'd appreciate your help in resolving this matter appropriately.`
    };
  }

  private generateMathErrorAppealLetter(detection: Detection, documentMeta: DocumentMeta): AppealLetter {
    const today = new Date().toLocaleDateString();
    const claimId = documentMeta.claimId || '[Claim Number]';
    const serviceDate = documentMeta.serviceDates?.start || '[Service Date]';

    return {
      title: 'Benefit Calculation Error Appeal Letter',
      body: `[Date: ${today}]

[Insurance Company Name]
Appeals Department
[Address]

Re: Appeal for Incorrect Benefit Calculation
Member: [Member Name]
Member ID: [Member ID]
Claim Number: ${claimId}
Service Date: ${serviceDate}
Provider: ${documentMeta.providerName || '[Provider Name]'}

Dear Appeals Review Team,

I am writing to formally appeal the benefit calculation for the above-referenced claim. The patient responsibility amount appears to be incorrectly calculated based on my plan benefits.

ISSUE SUMMARY:
The EOB shows a patient responsibility that does not align with my plan's deductible, coinsurance, and out-of-pocket maximum provisions.

FACTS:
${detection.evidence.snippets?.map(snippet => `• ${snippet}`).join('\n') || '• Benefit calculation discrepancy identified'}

REQUESTED RESOLUTION:
Please recalculate the patient responsibility using the correct benefit parameters and issue a corrected EOB. If the provider has been overpaid, please initiate recovery procedures and provide an updated patient responsibility amount.

POLICY BASIS:
Insurance contracts require accurate application of deductible, coinsurance, and out-of-pocket maximum provisions. Incorrect calculations violate the terms of the insurance agreement.

I have attached:
• Copy of original EOB
• Documentation of plan benefits
• Calculation worksheet showing expected amounts

Please process this appeal within the required timeframe and provide a written response with your determination.

Thank you for your prompt attention to this matter.

Sincerely,
[Member Signature]
[Member Printed Name]
[Date]

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`
    };
  }

  private generateNSAAppealLetter(detection: Detection, documentMeta: DocumentMeta): AppealLetter {
    const today = new Date().toLocaleDateString();
    const claimId = documentMeta.claimId || '[Claim Number]';
    const serviceDate = documentMeta.serviceDates?.start || '[Service Date]';
    const isEmergency = detection.category === 'NSA_ER';

    return {
      title: `No Surprises Act Appeal Letter — ${isEmergency ? 'Emergency' : 'Ancillary'} Services`,
      body: `[Date: ${today}]

[Insurance Company Name]
Appeals Department
[Address]

Re: Appeal Under No Surprises Act Protections
Member: [Member Name]
Member ID: [Member ID]
Claim Number: ${claimId}
Service Date: ${serviceDate}
Provider: ${documentMeta.providerName || '[Provider Name]'}

Dear Appeals Review Team,

I am formally appealing the processing of the above claim under the protections provided by the No Surprises Act (H.R.133), which became effective January 1, 2022.

ISSUE SUMMARY:
This claim for ${isEmergency ? 'emergency services' : 'facility-based ancillary services'} was processed with out-of-network cost-sharing, but should be protected under federal law limiting patient cost-sharing to in-network amounts.

FACTS:
${detection.evidence.snippets?.map(snippet => `• ${snippet}`).join('\n') || '• No Surprises Act violation identified'}

LAW/POLICY BASIS:
${isEmergency ?
  'Under 42 U.S.C. § 300gg-111, emergency services must be covered without prior authorization and with cost-sharing no greater than in-network amounts, regardless of provider network status.' :
  'Under 42 U.S.C. § 300gg-111(b), ancillary services provided at in-network facilities by out-of-network providers are subject to cost-sharing limitations when patients cannot reasonably choose their provider.'
}

REQUESTED RESOLUTION:
1. Reprocess this claim applying in-network cost-sharing amounts
2. Issue a corrected EOB reflecting proper No Surprises Act protections
3. Initiate any necessary provider negotiations or independent dispute resolution
4. Refund any excess payments made by the patient

I have attached:
• Copy of original EOB showing out-of-network processing
• Documentation of ${isEmergency ? 'emergency nature of services' : 'in-network facility status'}
• Relevant No Surprises Act provisions

This is a time-sensitive matter involving federal patient protections. Please expedite review and provide written confirmation of corrective action.

Sincerely,
[Member Signature]
[Member Printed Name]
[Date]

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`
    };
  }

  private generatePreventiveAppealLetter(detection: Detection, documentMeta: DocumentMeta): AppealLetter {
    const today = new Date().toLocaleDateString();
    const claimId = documentMeta.claimId || '[Claim Number]';
    const serviceDate = documentMeta.serviceDates?.start || '[Service Date]';

    return {
      title: 'Preventive Services Cost-Sharing Appeal Letter',
      body: `[Date: ${today}]

[Insurance Company Name]
Appeals Department
[Address]

Re: Appeal for Incorrect Cost-Sharing on Preventive Services
Member: [Member Name]
Member ID: [Member ID]
Claim Number: ${claimId}
Service Date: ${serviceDate}
Provider: ${documentMeta.providerName || '[Provider Name]'}

Dear Appeals Review Team,

I am appealing the application of cost-sharing to preventive services that should be covered at 100% under the Affordable Care Act.

ISSUE SUMMARY:
Preventive services were charged patient cost-sharing despite being required to be covered without cost-sharing for in-network providers under federal law.

FACTS:
${detection.evidence.snippets?.map(snippet => `• ${snippet}`).join('\n') || '• Preventive services with improper cost-sharing identified'}

LAW/POLICY BASIS:
Under the Affordable Care Act (42 U.S.C. § 300gg-13), group health plans and health insurance issuers must provide coverage for preventive health services without cost-sharing requirements when provided by in-network providers.

The services in question qualify as preventive care under:
• U.S. Preventive Services Task Force Grade A and B recommendations
• CDC Advisory Committee on Immunization Practices recommendations
• Health Resources and Services Administration guidelines

REQUESTED RESOLUTION:
1. Reprocess this claim with $0 patient cost-sharing
2. Recode services as preventive if incorrectly coded as diagnostic
3. Issue corrected EOB showing 100% coverage
4. Refund any cost-sharing amounts collected from patient

I have attached:
• Copy of original EOB
• Documentation showing preventive nature of services
• Relevant ACA preventive services provisions

Federal law requires this coverage without cost-sharing. Please correct this processing error promptly.

Sincerely,
[Member Signature]
[Member Printed Name]
[Date]

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`
    };
  }

  private deduplicateScripts(scripts: ScriptTemplate[]): ScriptTemplate[] {
    const seen = new Set<string>();
    return scripts.filter(script => {
      if (seen.has(script.title)) return false;
      seen.add(script.title);
      return true;
    });
  }

  private deduplicateLetters(letters: AppealLetter[]): AppealLetter[] {
    const seen = new Set<string>();
    return letters.filter(letter => {
      if (seen.has(letter.title)) return false;
      seen.add(letter.title);
      return true;
    });
  }
}