// @ts-nocheck
import { ChatAnswer, PolicyCitation, ScriptTemplate, AppealLetter, PricedSummary, MoneyCents } from '@/types/chat';

export class ThematicReasoner {

  public async generateAnswer(context: ChatProcessingContext): Promise<ChatAnswer> {
    console.log(`🤖 Generating thematic answer for case ${context.case.caseId}`);

    // Step 1: Build priced summary if we have claim data
    const pricedSummary = this.buildPricedSummary(context);

    // Step 2: Extract key facts from documents
    const keyFacts = this.extractKeyFacts(context);

    // Step 3: Run detections based on themes and extracted data
    const detections = await this.runDetections(context);

    // Step 4: Generate main answer based on themes
    const answer = await this.generateMainAnswer(context, detections);

    // Step 5: Create actionable checklist
    const checklist = this.generateChecklist(context, detections);

    // Step 6: Generate phone scripts
    const phoneScripts = this.generatePhoneScripts(context, detections);

    // Step 7: Generate appeal letters
    const appealLetters = this.generateAppealLetters(context, detections);

    // Step 8: Compile policy citations
    const sources = this.compilePolicyCitations(detections);

    // Step 9: Calculate overall confidence
    const confidence = {
      overall: this.calculateOverallConfidence(context, detections),
      ocr: context.confidenceScores.overallOCR
    };

    const result: ChatAnswer = {
      caseId: context.case.caseId,
      pricedSummary,
      keyFacts,
      detections,
      answer,
      checklist,
      phoneScripts,
      appealLetters,
      sources,
      confidence
    };

    console.log(`✅ Generated comprehensive answer with ${detections.length} detections and ${sources.length} citations`);

    return result;
  }

  private buildPricedSummary(context: ChatProcessingContext): PricedSummary | undefined {
    const headers = Array.from(context.extractedHeaders.values());
    const totals = Array.from(context.extractedTotals.values());
    const lineItems = Array.from(context.extractedLineItems.values()).flat();

    if (headers.length === 0 && totals.length === 0 && lineItems.length === 0) {
      return undefined;
    }

    // Build header from first available document
    const firstHeader = headers[0];
    const firstTotals = totals[0];

    const summary: PricedSummary = {
      header: {
        providerName: firstHeader?.providerInfo?.providerName?.value,
        NPI: firstHeader?.providerInfo?.npi?.value,
        claimId: firstHeader?.claimInfo?.claimId?.value,
        accountId: firstHeader?.claimInfo?.accountId?.value,
        dos: firstHeader?.serviceDates ? {
          start: firstHeader.serviceDates.start.date,
          end: firstHeader.serviceDates.end?.date
        } : undefined,
        payer: firstHeader?.payerInfo?.payerName?.value
      }
    };

    // Add totals if available
    if (firstTotals) {
      summary.totals = {
        billed: firstTotals.billed?.amount,
        allowed: firstTotals.allowed?.amount,
        planPaid: firstTotals.planPaid?.amount,
        patientResp: firstTotals.patientResp?.amount
      };
    }

    // Add line items
    if (lineItems.length > 0) {
      summary.lines = lineItems.map(item => ({
        lineId: item.lineId,
        code: item.code?.value,
        modifiers: item.modifiers?.map(m => m.value),
        desc: item.description?.text,
        units: item.units?.value,
        charge: item.charges?.billed?.amount,
        allowed: item.charges?.allowed?.amount,
        planPaid: item.charges?.planPaid?.amount,
        patientResp: item.charges?.patientResp?.amount,
        conf: item.code?.ocr?.conf
      }));
    }

    summary.notes = [
      "Extracted from uploaded documents using OCR",
      "Used for analysis and recommendations below"
    ];

    return summary;
  }

  private extractKeyFacts(context: ChatProcessingContext): string[] {
    const facts: string[] = [];

    // Extract facts from headers
    context.extractedHeaders.forEach((header, artifactId) => {
      if (header.providerInfo?.providerName) {
        facts.push(`Provider: ${header.providerInfo.providerName.value}`);
      }
      if (header.payerInfo?.payerName) {
        facts.push(`Insurance: ${header.payerInfo.payerName.value}`);
      }
      if (header.serviceDates) {
        facts.push(`Service Date: ${header.serviceDates.start.date}`);
      }
    });

    // Extract facts from totals
    context.extractedTotals.forEach((totals, artifactId) => {
      if (totals.billed) {
        facts.push(`Total Billed: $${(totals.billed.amount / 100).toFixed(2)}`);
      }
      if (totals.patientResp) {
        facts.push(`Patient Responsibility: $${(totals.patientResp.amount / 100).toFixed(2)}`);
      }
    });

    // Extract facts from inferred context
    if (context.case.inferred?.emergency) {
      facts.push("Emergency service detected");
    }
    if (context.case.inferred?.nsaCandidate) {
      facts.push("Potential No Surprises Act case");
    }
    if (context.case.inferred?.ancillary?.length) {
      facts.push(`Ancillary services: ${context.case.inferred.ancillary.join(', ')}`);
    }

    return facts.slice(0, 8); // Limit to most important facts
  }

  private async runDetections(context: ChatProcessingContext): Promise<ChatDetection[]> {
    const detections: ChatDetection[] = [];

    // NSA Emergency & Ancillary Detection
    if (context.case.inferred?.emergency && context.case.inferred?.ancillary?.length) {
      detections.push({
        category: "No Surprises Act - Emergency Services",
        severity: "high",
        explanation: "Emergency services with out-of-network ancillary providers are protected under the No Surprises Act. You should only pay in-network cost-sharing amounts.",
        evidence: {
          snippets: ["Emergency service detected", `Ancillary services: ${context.case.inferred.ancillary.join(', ')}`]
        },
        policyCitations: [
          {
            title: "NSA — Emergency Services Protection",
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

    // Preventive Care Detection
    const preventiveCodes = ['G0439', 'Z00', 'Z01', 'Z12', 'Z13'];
    context.extractedLineItems.forEach((items, artifactId) => {
      const preventiveItems = items.filter(item =>
        preventiveCodes.some(code => item.code?.value.startsWith(code))
      );

      if (preventiveItems.length > 0 && preventiveItems.some(item =>
        item.charges?.patientResp?.amount && item.charges.patientResp.amount > 0
      )) {
        detections.push({
          category: "Preventive Care Billing Issue",
          severity: "warn",
          explanation: "Preventive care services should have no patient cost-sharing under the ACA. If you're being charged, this may be incorrect billing.",
          evidence: {
            lineRefs: preventiveItems.map(item => item.lineId),
            snippets: preventiveItems.map(item => `${item.code?.value}: $${(item.charges?.patientResp?.amount || 0) / 100}`)
          },
          policyCitations: [
            {
              title: "ACA — Preventive Services Cost-Sharing Prohibition",
              authority: "Federal",
              citation: "42 USC § 18022(b)(1)"
            }
          ]
        });
      }
    });

    // Large Balance Detection
    context.extractedTotals.forEach((totals, artifactId) => {
      if (totals.patientResp?.amount && totals.patientResp.amount > 500000) { // $5000+
        detections.push({
          category: "High Medical Bill",
          severity: "high",
          explanation: "Large medical bills may qualify for financial assistance programs. Hospitals are required to have charity care policies.",
          evidence: {
            snippets: [`Patient responsibility: $${(totals.patientResp.amount / 100).toFixed(2)}`]
          },
          policyCitations: [
            {
              title: "IRS — Hospital Charity Care Requirements",
              authority: "Federal",
              citation: "IRC § 501(r)"
            }
          ]
        });
      }
    });

    // Coordination of Benefits Detection
    if (context.case.benefits?.secondaryCoverage) {
      detections.push({
        category: "Coordination of Benefits",
        severity: "info",
        explanation: "With secondary insurance, ensure both plans have processed the claim. The secondary plan should pay after the primary.",
        policyCitations: [
          {
            title: "NAIC — Coordination of Benefits Model",
            authority: "StateDOI",
            citation: "NAIC-COB-2020"
          }
        ]
      });
    }

    return detections;
  }

  private async generateMainAnswer(context: ChatProcessingContext, detections: ChatDetection[]): Promise<string> {
    const themes = context.themeClassification;
    const primaryTheme = themes[0] || 'General';

    let answer = `## Understanding Your ${primaryTheme} Situation\n\n`;

    // Theme-specific introductions
    switch (primaryTheme) {
      case 'Claims/Billing/EOB/Appeals':
        answer += "I've analyzed your medical billing documents and can help you understand what you're seeing and what steps to take.\\n\\n";
        break;
      case 'OON/Balance Billing':
        answer += "I've reviewed your billing situation for potential balance billing or No Surprises Act protections.\\n\\n";
        break;
      case 'Costs':
        answer += "Let me help you understand the costs shown in your documents and how your insurance benefits apply.\\n\\n";
        break;
      default:
        answer += "Based on your question and uploaded documents, here's what I found and how I can help.\\n\\n";
    }

    // Include key findings from detections
    if (detections.length > 0) {
      answer += "### Key Findings:\\n";
      detections.forEach(detection => {
        answer += `- **${detection.category}**: ${detection.explanation}\\n`;
      });
      answer += "\\n";
    }

    // Provide document-specific insights
    const hasDocumentData = context.extractedTotals.size > 0 || context.extractedLineItems.size > 0;
    if (hasDocumentData) {
      answer += "### What Your Documents Show:\n";

      // Show totals from extracted data
      const firstTotals = Array.from(context.extractedTotals.values())[0];
      if (firstTotals?.billed) {
        answer += `- Total charges: $${(firstTotals.billed.amount / 100).toFixed(2)}\n`;
      }
      if (firstTotals?.patientResp) {
        answer += `- Your responsibility: $${(firstTotals.patientResp.amount / 100).toFixed(2)}\n`;
      }
      answer += "\n";
    }

    // Add educational content based on theme
    answer += this.getThemeEducationalContent(primaryTheme, context);

    // Add disclaimer
    answer += "\\n---\\n*This analysis is for educational purposes only and does not constitute legal or medical advice. Always verify information with your insurance company and healthcare providers.*";

    return answer;
  }

  private getThemeEducationalContent(theme: string, context: ChatProcessingContext): string {
    switch (theme) {
      case 'Claims/Billing/EOB/Appeals':
        return `### Understanding Your EOB/Bill:\\n
**Explanation of Benefits (EOB)**: Shows how your insurance processed a claim. This is NOT a bill.\\n
**Medical Bill**: What the provider charges you directly. Should match EOB patient responsibility.\\n\\n
**Key Terms**:\\n
- **Billed Amount**: What the provider charges\\n
- **Allowed Amount**: Maximum your insurance will pay\\n
- **Plan Paid**: What insurance actually paid\\n
- **Patient Responsibility**: What you owe (deductible + coinsurance + copay)\\n\\n`;

      case 'OON/Balance Billing':
        return `### Balance Billing Protection:\\n
The **No Surprises Act** protects you from surprise bills in these situations:\\n
- Emergency care at any facility\\n
- Non-emergency care at in-network facilities by out-of-network providers\\n
- Air ambulance services\\n\\n
**You should only pay in-network cost-sharing** even if treated by out-of-network providers in these scenarios.\\n\\n`;

      case 'Costs':
        return `### How Insurance Costs Work:\\n
**Deductible**: Amount you pay before insurance helps (except preventive care)\\n
**Copay**: Fixed amount for certain services\\n
**Coinsurance**: Percentage you pay after meeting deductible\\n
**Out-of-Pocket Maximum**: Most you'll pay in a year\\n\\n`;

      default:
        return "";
    }
  }

  private generateChecklist(context: ChatProcessingContext, detections: ChatDetection[]): string[] {
    const checklist: string[] = [];

    // Universal first steps
    checklist.push("Review all documents carefully for accuracy");
    checklist.push("Verify provider and insurance information matches your records");

    // Detection-specific items
    detections.forEach(detection => {
      switch (detection.category) {
        case "No Surprises Act - Emergency Services":
          checklist.push("Contact your insurance to confirm in-network cost-sharing applies");
          checklist.push("If balance billed, dispute with provider citing No Surprises Act");
          break;
        case "Preventive Care Billing Issue":
          checklist.push("Call insurance to verify preventive care coding");
          checklist.push("Request provider re-bill with correct preventive codes");
          break;
        case "High Medical Bill":
          checklist.push("Ask hospital about financial assistance programs");
          checklist.push("Request itemized bill if not already provided");
          checklist.push("Inquire about payment plan options");
          break;
      }
    });

    // Theme-specific items
    if (context.themeClassification.includes('Claims/Billing/EOB/Appeals')) {
      checklist.push("Compare EOB amounts with bill amounts");
      checklist.push("Check if claim was processed as in-network or out-of-network");
    }

    if (context.case.benefits) {
      checklist.push("Verify benefits information with insurance company");
      if (context.case.benefits.secondaryCoverage) {
        checklist.push("Ensure both primary and secondary insurance have processed claim");
      }
    }

    // Always include appeal option
    checklist.push("Know your appeal rights if you disagree with insurance decisions");

    return checklist.slice(0, 10); // Limit to most important items
  }

  private generatePhoneScripts(context: ChatProcessingContext, detections: ChatDetection[]): ScriptTemplate[] {
    const scripts: ScriptTemplate[] = [];

    // Insurance company script
    const insuranceScript = this.buildInsuranceScript(context, detections);
    if (insuranceScript) {
      scripts.push(insuranceScript);
    }

    // Provider billing script
    const providerScript = this.buildProviderScript(context, detections);
    if (providerScript) {
      scripts.push(providerScript);
    }

    return scripts;
  }

  private buildInsuranceScript(context: ChatProcessingContext, detections: ChatDetection[]): ScriptTemplate | null {
    const claimId = Array.from(context.extractedHeaders.values())[0]?.claimInfo?.claimId?.value;
    const memberInfo = Array.from(context.extractedHeaders.values())[0]?.memberInfo;

    let script = `Hello, I'm calling about a claim that was processed.\\n\\n`;

    if (memberInfo?.memberId) {
      script += `My member ID is ${memberInfo.memberId.value}.\\n`;
    }
    if (claimId) {
      script += `The claim number is ${claimId}.\\n`;
    }

    script += `\\nI have questions about:\\n`;

    // Add detection-specific questions
    detections.forEach(detection => {
      switch (detection.category) {
        case "No Surprises Act - Emergency Services":
          script += `- This appears to be emergency care with out-of-network providers. Under the No Surprises Act, I should only pay in-network cost-sharing. Can you confirm this was processed correctly?\\n`;
          break;
        case "Preventive Care Billing Issue":
          script += `- I was charged for what appears to be preventive care. These services should be covered at 100% under the ACA. Can you review the coding?\\n`;
          break;
        case "Coordination of Benefits":
          script += `- I have secondary coverage. Can you confirm both insurances processed this claim in the correct order?\\n`;
          break;
      }
    });

    script += `\\nCan you please review this claim and explain the benefits that were applied?\\n\\n`;
    script += `**What to ask for:**\\n- Claim processing details\\n- Appeal process if you disagree\\n- Reference number for your call`;

    return {
      title: "Insurance Company Call Script",
      body: script
    };
  }

  private buildProviderScript(context: ChatProcessingContext, detections: ChatDetection[]): ScriptTemplate | null {
    const accountId = Array.from(context.extractedHeaders.values())[0]?.claimInfo?.accountId?.value;
    const providerName = Array.from(context.extractedHeaders.values())[0]?.providerInfo?.providerName?.value;

    let script = `Hello, I'm calling about a medical bill.\\n\\n`;

    if (accountId) {
      script += `The account number is ${accountId}.\\n`;
    }
    if (providerName) {
      script += `This is for services at ${providerName}.\\n`;
    }

    script += `\\nI need help with:\\n`;

    // Add detection-specific requests
    let hasProviderIssues = false;
    detections.forEach(detection => {
      switch (detection.category) {
        case "No Surprises Act - Emergency Services":
          script += `- I received emergency care and believe I'm protected under the No Surprises Act from balance billing. Can you adjust this bill to in-network cost-sharing?\\n`;
          hasProviderIssues = true;
          break;
        case "High Medical Bill":
          script += `- Information about financial assistance programs or payment plans\\n`;
          hasProviderIssues = true;
          break;
      }
    });

    if (!hasProviderIssues) {
      script += `- Understanding the charges on this bill\\n`;
      script += `- Verification that insurance has been billed correctly\\n`;
    }

    script += `\\n**What to ask for:**\\n- Itemized bill\\n- Financial assistance application\\n- Payment plan options\\n- Billing manager if needed`;

    return {
      title: "Provider Billing Office Call Script",
      body: script
    };
  }

  private generateAppealLetters(context: ChatProcessingContext, detections: ChatDetection[]): AppealLetter[] {
    const letters: AppealLetter[] = [];

    // Generate appeal letters for relevant detections
    detections.forEach(detection => {
      if (detection.severity === 'high' || detection.category.includes('Denial')) {
        const letter = this.buildAppealLetter(detection, context);
        if (letter) {
          letters.push(letter);
        }
      }
    });

    return letters;
  }

  private buildAppealLetter(detection: ChatDetection, context: ChatProcessingContext): AppealLetter | null {
    const claimId = Array.from(context.extractedHeaders.values())[0]?.claimInfo?.claimId?.value;
    const memberInfo = Array.from(context.extractedHeaders.values())[0]?.memberInfo;

    let letter = `[Date]\\n\\n[Insurance Company Name]\\n[Address]\\n\\nRe: Appeal for Claim #${claimId || '[Claim Number]'}\\nMember ID: ${memberInfo?.memberId?.value || '[Member ID]'}\\n\\nDear Appeals Department,\\n\\n`;

    switch (detection.category) {
      case "No Surprises Act - Emergency Services":
        letter += `I am writing to appeal the processing of the above claim under the protections of the No Surprises Act (NSA).\\n\\n`;
        letter += `This claim involves emergency services where I was treated by out-of-network providers at a facility. Under 45 CFR § 149.110, I am protected from balance billing and should only be responsible for in-network cost-sharing amounts.\\n\\n`;
        letter += `I request that you:\\n1. Reprocess this claim applying in-network benefits\\n2. Pay the provider the out-of-network allowed amount\\n3. Adjust my patient responsibility to in-network levels\\n\\n`;
        break;

      case "Preventive Care Billing Issue":
        letter += `I am appealing the denial/processing of preventive care services that should be covered at 100% under the Affordable Care Act.\\n\\n`;
        letter += `Under 42 USC § 18022(b)(1), preventive services with A or B recommendations from the USPSTF must be covered without cost-sharing when provided by in-network providers.\\n\\n`;
        letter += `I request that you reprocess this claim with zero patient cost-sharing.\\n\\n`;
        break;

      default:
        letter += `I am formally appealing your decision on the above-referenced claim.\\n\\n`;
        letter += `${detection.explanation}\\n\\n`;
        letter += `I request that you review this decision and provide appropriate coverage.\\n\\n`;
    }

    letter += `Please provide a written response within the timeframes required by state and federal law.\\n\\nSincerely,\\n[Your Name]\\n[Your Contact Information]`;

    return {
      title: `Appeal Letter - ${detection.category}`,
      body: letter
    };
  }

  private compilePolicyCitations(detections: ChatDetection[]): PolicyCitation[] {
    const citations: PolicyCitation[] = [];
    const seen = new Set<string>();

    detections.forEach(detection => {
      if (detection.policyCitations) {
        detection.policyCitations.forEach(citation => {
          const key = `${citation.authority}:${citation.citation}`;
          if (!seen.has(key)) {
            citations.push(citation);
            seen.add(key);
          }
        });
      }
    });

    // Add universal citations
    const universalCitations: PolicyCitation[] = [
      {
        title: "Patient Rights and Responsibilities",
        authority: "Federal",
        citation: "42 CFR § 482.13"
      },
      {
        title: "Insurance Appeals Process",
        authority: "Federal",
        citation: "29 CFR § 2560.503-1"
      }
    ];

    universalCitations.forEach(citation => {
      const key = `${citation.authority}:${citation.citation}`;
      if (!seen.has(key)) {
        citations.push(citation);
        seen.add(key);
      }
    });

    return citations;
  }

  private calculateOverallConfidence(context: ChatProcessingContext, detections: ChatDetection[]): number {
    let confidence = context.confidenceScores.overallOCR * 0.4; // OCR baseline

    // Boost for successful field extraction
    const hasHeaders = context.extractedHeaders.size > 0;
    const hasTotals = context.extractedTotals.size > 0;
    const hasLineItems = context.extractedLineItems.size > 0;

    if (hasHeaders) confidence += 15;
    if (hasTotals) confidence += 15;
    if (hasLineItems) confidence += 10;

    // Boost for theme classification
    if (context.themeClassification.length > 0) confidence += 10;

    // Boost for successful detections
    confidence += Math.min(10, detections.length * 2);

    return Math.min(95, Math.max(50, Math.round(confidence)));
  }
}