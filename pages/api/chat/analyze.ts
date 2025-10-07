import { NextApiRequest, NextApiResponse } from 'next';
import { UnifiedChatCase, ChatAnswer, BenefitsContext } from '@/types/chat';
import { ChatResponse } from '@/types/qakb';
import { OCRProcessor } from '@/lib/chat/ocr';
import { themeRouter } from '@/lib/chat/router';
import { qakbRetriever } from '@/lib/qakb/index';
import { answerComposer } from '@/lib/chat/compose';

interface AnalyzeRequest {
  case: UnifiedChatCase;
  benefits?: BenefitsContext;
}

interface AnalyzeResponse {
  success: boolean;
  answer?: ChatAnswer;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalyzeResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { case: chatCase, benefits }: AnalyzeRequest = req.body;

    if (!chatCase || !chatCase.narrative?.text) {
      return res.status(400).json({
        success: false,
        error: 'Missing required case data or narrative'
      });
    }

    // Initialize processors
    const ocrProcessor = new OCRProcessor();

    // Step 1: Process and merge case documents
    console.log(`Processing case ${chatCase.caseId} with ${chatCase.artifacts.length} documents`);

    const mergedCase = await ocrProcessor.mergeCaseDocuments(
      chatCase.caseId,
      chatCase.narrative.text,
      chatCase.artifacts,
      new Map(), // extractedHeaders - would be populated in real implementation
      new Map(), // extractedTotals - would be populated in real implementation
      new Map()  // extractedLineItems - would be populated in real implementation
    );

    // Step 2: Classify themes based on narrative and case content
    console.log('Classifying themes...');
    const themeClassification = await themeRouter.classifyThemes(
      chatCase.narrative.text,
      mergedCase
    );

    console.log(`Classified themes: ${themeClassification.themes.join(', ')}`);

    // Step 3: Query QAKB for matching answer cards
    const qakbQuery = {
      narrative: chatCase.narrative.text,
      themes: themeClassification.themes,
      caseContext: {
        hasDocuments: chatCase.artifacts.length > 0,
        hasClaims: mergedCase.documents.some(d => ['EOB', 'BILL'].includes(d.docType)),
        hasLineItems: (mergedCase.matchedLineItems?.length || 0) > 0,
        emergency: mergedCase.inferred?.emergency,
        nsaCandidate: mergedCase.inferred?.nsaCandidate
      }
    };

    console.log('Retrieving answer cards...');
    const qakbResult = await qakbRetriever.retrieveAnswers(qakbQuery);

    console.log(`Primary card: ${qakbResult.primaryCard.theme} - ${qakbResult.primaryCard.question}`);

    // Step 4: Compose personalized answer with case facts
    console.log('Composing personalized answer...');
    const chatResponse = await answerComposer.composeAnswer({
      mergedCase,
      primaryCard: qakbResult.primaryCard,
      secondaryCards: qakbResult.secondaryCards,
      benefits,
      userNarrative: chatCase.narrative.text
    });

    // Step 5: Convert to ChatAnswer format
    const chatAnswer: ChatAnswer = {
      caseId: chatCase.caseId,
      pricedSummary: chatResponse.pricedSummary,
      keyFacts: extractKeyFacts(mergedCase),
      detections: generateDetections(mergedCase, themeClassification),
      answer: chatResponse.answer,
      checklist: chatResponse.checklist,
      phoneScripts: chatResponse.phoneScripts,
      appealLetters: chatResponse.appealLetters,
      sources: chatResponse.sources,
      confidence: {
        overall: chatResponse.confidence.overall,
        ocr: chatResponse.confidence.ocr
      }
    };

    console.log(`Analysis complete with ${chatAnswer.confidence.overall} confidence`);

    res.status(200).json({
      success: true,
      answer: chatAnswer
    });

  } catch (error) {
    console.error('Chat analysis error:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

function extractKeyFacts(mergedCase: any): string[] {
  const facts: string[] = [];

  if (mergedCase.consolidatedTotals) {
    const totals = mergedCase.consolidatedTotals;
    if (totals.billed) {
      facts.push(`Total billed: $${(totals.billed / 100).toFixed(2)}`);
    }
    if (totals.patientResp) {
      facts.push(`Your responsibility: $${(totals.patientResp / 100).toFixed(2)}`);
    }
    if (totals.planPaid) {
      facts.push(`Insurance paid: $${(totals.planPaid / 100).toFixed(2)}`);
    }
  }

  if (mergedCase.documents.length > 0) {
    facts.push(`${mergedCase.documents.length} document(s) analyzed`);
  }

  if (mergedCase.matchedLineItems && mergedCase.matchedLineItems.length > 0) {
    facts.push(`${mergedCase.matchedLineItems.length} line item(s) found`);
  }

  if (mergedCase.inferred?.facility) {
    facts.push(`Service location: ${mergedCase.inferred.facility}`);
  }

  if (mergedCase.inferred?.emergency) {
    facts.push('Emergency care scenario identified');
  }

  if (mergedCase.inferred?.nsaCandidate) {
    facts.push('Potential No Surprises Act protection');
  }

  return facts.slice(0, 6); // Limit to most important facts
}

function generateDetections(mergedCase: any, themeClassification: any): any[] {
  const detections: any[] = [];

  // High-value patient responsibility detection
  if (mergedCase.consolidatedTotals?.patientResp > 100000) { // >$1000
    detections.push({
      category: 'High Patient Responsibility',
      severity: 'high' as const,
      explanation: `You have a high patient responsibility amount of $${(mergedCase.consolidatedTotals.patientResp / 100).toFixed(2)}. Consider reviewing your benefits and exploring financial assistance options.`,
      evidence: {
        snippets: [`Patient responsibility: $${(mergedCase.consolidatedTotals.patientResp / 100).toFixed(2)}`]
      }
    });
  }

  // No Surprises Act candidate detection
  if (mergedCase.inferred?.nsaCandidate) {
    detections.push({
      category: 'No Surprises Act Protection',
      severity: 'warn' as const,
      explanation: 'This case may qualify for No Surprises Act protections against balance billing. Review the specific circumstances of your care.',
      evidence: {
        snippets: mergedCase.inferred.emergency ? ['Emergency care scenario'] : ['Potential out-of-network scenario']
      }
    });
  }

  // Multiple document complexity
  if (mergedCase.documents.length > 2) {
    detections.push({
      category: 'Complex Case',
      severity: 'info' as const,
      explanation: `Multiple documents (${mergedCase.documents.length}) indicate a complex case that may require careful review of all components.`,
      evidence: {
        snippets: mergedCase.documents.map((d: any) => `${d.docType}: ${d.filename}`)
      }
    });
  }

  // Theme confidence detection
  if (themeClassification.confidence < 0.6) {
    detections.push({
      category: 'Classification Uncertainty',
      severity: 'info' as const,
      explanation: 'The system had moderate confidence in categorizing your case. Consider providing additional details for more targeted assistance.',
      evidence: {
        snippets: [`Classification confidence: ${Math.round(themeClassification.confidence * 100)}%`]
      }
    });
  }

  return detections;
}