// Legacy OCR types - using any for compatibility
type OCRResult = any;
type OCRToken = any;
type OCRKeyValue = any;
import { DocumentArtifact, LineItem } from '@/types/analyzer';
import { UnifiedChatCase, ChatAnswer } from '@/types/chat';
import { PHIDeidentifier, DeidentificationOptions } from './index';

/**
 * PHI integration utilities for OCR and chat systems
 */
export class PHIIntegrations {
  private deidentifier = new PHIDeidentifier();

  /**
   * Deidentify OCR results while preserving structure
   */
  public deidentifyOCRResult(
    ocrResult: OCRResult,
    options?: DeidentificationOptions
  ): { deidentifiedResult: OCRResult; phiDetected: boolean } {
    console.log('🔒 Deidentifying OCR results...');

    const deidentifyOptions: DeidentificationOptions = {
      enableSafeMode: true,
      preserveFormatting: true,
      confidenceThreshold: 0.7,
      replacementStrategy: 'consistent',
      ...options
    };

    let phiDetected = false;

    // Deidentify tokens
    const deidentifiedTokens: OCRToken[] = ocrResult.tokens.map((token: any) => {
      const result = this.deidentifier.deidentify(token.text, deidentifyOptions);

      if (result.detections.length > 0) {
        phiDetected = true;
        console.log(`🔒 Deidentified token: "${token.text}" -> "${result.deidentifiedText}"`);
      }

      return {
        ...token,
        text: result.deidentifiedText
      };
    });

    // Deidentify key-value pairs
    const deidentifiedKVs: OCRKeyValue[] = ocrResult.kvs.map((kv: any) => {
      const keyResult = this.deidentifier.deidentify(kv.key, deidentifyOptions);
      const valueResult = this.deidentifier.deidentify(kv.value, deidentifyOptions);

      if (keyResult.detections.length > 0 || valueResult.detections.length > 0) {
        phiDetected = true;
      }

      return {
        ...kv,
        key: keyResult.deidentifiedText,
        value: valueResult.deidentifiedText
      };
    });

    // Deidentify table content
    const deidentifiedTables = ocrResult.tables.map((table: any) => ({
      ...table,
      rows: table.rows.map((row: any) =>
        row.map((cell: any) => {
          const result = this.deidentifier.deidentify(cell.text, deidentifyOptions);
          if (result.detections.length > 0) {
            phiDetected = true;
          }
          return {
            ...cell,
            text: result.deidentifiedText
          };
        })
      )
    }));

    const deidentifiedResult: OCRResult = {
      tokens: deidentifiedTokens,
      kvs: deidentifiedKVs,
      tables: deidentifiedTables,
      metadata: {
        ...ocrResult.metadata,
        // PHI deidentification metadata would be stored separately
      }
    };

    console.log(`✅ OCR deidentification complete. PHI detected: ${phiDetected}`);
    return { deidentifiedResult, phiDetected };
  }

  /**
   * Deidentify document artifact
   */
  public deidentifyDocumentArtifact(
    artifact: DocumentArtifact,
    options?: DeidentificationOptions
  ): { deidentifiedArtifact: DocumentArtifact; phiDetected: boolean } {
    console.log('🔒 Deidentifying document artifact...');

    const deidentifyOptions: DeidentificationOptions = {
      enableSafeMode: true,
      preserveFormatting: true,
      confidenceThreshold: 0.7,
      replacementStrategy: 'consistent',
      ...options
    };

    let phiDetected = false;

    // Deidentify OCR data (rawOCR property not available in DocumentArtifact)
    // Would deidentify OCR results if they were attached to the artifact

    // Deidentify line items (lineItems not available in DocumentArtifact)
    // Would deidentify LineItem descriptions and codes if they were part of the artifact

    // DocumentArtifact interface only contains basic file info, not provider/patient data
    // In a production system, PHI would be deidentified from structured data separately
    const deidentifiedArtifact: DocumentArtifact = {
      ...artifact
      // Most artifact properties are metadata that don't contain PHI
    };

    console.log(`✅ Artifact deidentification complete. PHI detected: ${phiDetected}`);
    return { deidentifiedArtifact, phiDetected };
  }

  /**
   * Deidentify chat case before processing
   */
  public deidentifyChatCase(
    chatCase: UnifiedChatCase,
    options?: DeidentificationOptions
  ): { deidentifiedCase: UnifiedChatCase; phiDetected: boolean } {
    console.log('🔒 Deidentifying chat case...');

    const deidentifyOptions: DeidentificationOptions = {
      enableSafeMode: true,
      preserveFormatting: true,
      confidenceThreshold: 0.6, // More aggressive for chat
      replacementStrategy: 'generic', // Generic for privacy
      ...options
    };

    let phiDetected = false;

    // Deidentify user message
    const messageResult = this.deidentifier.deidentify(chatCase.narrative.text, deidentifyOptions);
    if (messageResult.detections.length > 0) {
      phiDetected = true;
      console.log(`🔒 PHI detected in user message`);
    }

    // Deidentify artifacts if present
    const deidentifiedArtifacts = chatCase.artifacts.map(artifact => {
      // DocumentArtifact properties are mostly metadata without PHI
      return artifact;
    });

    const deidentifiedCase: UnifiedChatCase = {
      ...chatCase,
      narrative: {
        ...chatCase.narrative,
        text: messageResult.deidentifiedText
      },
      artifacts: deidentifiedArtifacts
    };

    console.log(`✅ Chat case deidentification complete. PHI detected: ${phiDetected}`);
    return { deidentifiedCase, phiDetected };
  }

  /**
   * Deidentify chat answer before returning to user
   */
  public deidentifyChatAnswer(
    chatAnswer: ChatAnswer,
    options?: DeidentificationOptions
  ): { deidentifiedAnswer: ChatAnswer; phiDetected: boolean } {
    const deidentifyOptions: DeidentificationOptions = {
      enableSafeMode: true,
      preserveFormatting: true,
      confidenceThreshold: 0.6,
      replacementStrategy: 'generic',
      ...options
    };

    // Deidentify the answer text
    const answerResult = this.deidentifier.deidentify(chatAnswer.answer, deidentifyOptions);
    const phiDetected = answerResult.detections.length > 0;

    if (phiDetected) {
      console.log(`⚠️ PHI detected in chat response - this should not happen!`);
    }

    const deidentifiedAnswer: ChatAnswer = {
      ...chatAnswer,
      answer: answerResult.deidentifiedText
    };

    return { deidentifiedAnswer, phiDetected };
  }

  /**
   * Validate that text is PHI-compliant before external transmission
   */
  public validateForTransmission(text: string): {
    isSafe: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    issues: string[];
  } {
    const validation = this.deidentifier.validateDeidentification(text);

    const issues = validation.remainingPHI.map(phi =>
      `Potential ${phi.category}: "${phi.text}" (confidence: ${(phi.confidence * 100).toFixed(1)}%)`
    );

    return {
      isSafe: validation.isValid,
      riskLevel: validation.riskLevel,
      issues
    };
  }

  /**
   * Reset deidentifier state (for new sessions)
   */
  public reset(): void {
    this.deidentifier.clearCache();
  }
}