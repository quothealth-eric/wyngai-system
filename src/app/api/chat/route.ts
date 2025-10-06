import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { generateResponse } from '@/lib/anthropic';
import { buildRAGContext, formatRAGContextForLLM } from '@/lib/rag';
import { chatMessageSchema } from '@/lib/validations';
import { redactSensitiveInfo } from '@/lib/validations';
import { analyzeMedicalBill } from '@/lib/medical-bill-analyzer';
import { enhancedRAG, enrichResponseWithCitations, fallbackResponses } from '@/lib/enhanced-rag';
import { ImageProcessor, ProcessedImage } from '@/lib/image-processor';
import { CaseFusion, ChatCaseInput } from '@/lib/case-fusion';
import { IntentClassifier } from '@/lib/intent-classifier';
import { RulesEngine } from '@/lib/rules-engine';
import { AnswerPackGenerator } from '@/lib/answer-pack-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validatedInput = chatMessageSchema.parse(body);
    const { message, benefits, fileIds } = validatedInput;

    // Get OCR texts from uploaded files
    let ocrTexts: string[] = [];
    if (fileIds && fileIds.length > 0) {
      console.log('🔍 Fetching OCR text for file IDs:', JSON.stringify(fileIds));

      const { data: files, error: filesError } = await supabase
        .from('files')
        .select('id, ocr_text, file_name, file_type, ocr_confidence')
        .in('id', fileIds);

      if (filesError) {
        console.error('❌ Error fetching files:', filesError);
      } else if (!files || files.length === 0) {
        console.error('⚠️ No files found with IDs:', fileIds);
      } else {
        console.log('📄 Found files in database:', files.length);
        files.forEach((file, index) => {
          console.log(`   File ${index + 1}:`);
          console.log(`     ID: ${file.id}`);
          console.log(`     Name: ${file.file_name}`);
          console.log(`     Type: ${file.file_type}`);
          console.log(`     Confidence: ${file.ocr_confidence}%`);
          console.log(`     OCR Text exists: ${!!file.ocr_text}`);
          console.log(`     OCR Text length: ${file.ocr_text?.length || 0} chars`);
          if (file.ocr_text) {
            console.log(`     OCR Text preview: ${file.ocr_text.substring(0, 100)}...`);
          }
        });

        ocrTexts = files
          .map(file => file.ocr_text)
          .filter(text => text && text.trim().length > 0);

        console.log('✅ Extracted OCR texts:', ocrTexts.length, 'texts');
        if (ocrTexts.length > 0) {
          console.log('   Total text length:', ocrTexts.join('').length, 'chars');
          console.log('   First text preview:', ocrTexts[0].substring(0, 200) + '...');
        }
      }
    } else {
      console.log('📭 No file IDs provided for OCR processing');
    }

    // Use enhanced processing if files are available
    let enhancedResponse = null;
    if (fileIds && fileIds.length > 0) {
      console.log('🚀 Using enhanced chat processing pipeline');

      try {
        // Get processed image data from database
        const { data: filesData, error: filesError } = await supabase
          .from('files')
          .select('extracted_fields, document_type, ocr_confidence')
          .in('id', fileIds);

        if (!filesError && filesData && filesData.length > 0) {
          // Reconstruct processed images from database
          const processedImages: ProcessedImage[] = filesData.map((file, index) => ({
            artifactId: `db_${fileIds[index]}`,
            mime: 'application/ocr-result',
            width: 0,
            height: 0,
            ocrText: ocrTexts[index] || '',
            ocrConf: file.ocr_confidence || 0,
            documentType: file.document_type as 'eob' | 'bill' | 'insurance_card' | 'unknown',
            extractedData: file.extracted_fields ? JSON.parse(file.extracted_fields) : {
              header: {},
              totals: {},
              lines: [],
              remarks: {}
            }
          }));

          // Run enhanced processing pipeline
          const fusedCase = CaseFusion.fuseCase(processedImages, message, benefits);
          const intentClassification = IntentClassifier.classifyIntent(fusedCase);
          const detections = RulesEngine.analyzeCase(fusedCase);
          enhancedResponse = AnswerPackGenerator.generateAnswerPack(fusedCase, intentClassification, detections);

          console.log(`✅ Enhanced processing complete: ${detections.length} detections, ${enhancedResponse.scriptsAndLetters.phoneScripts.length} scripts`);
        }
      } catch (error) {
        console.error('⚠️ Enhanced processing failed, falling back to legacy:', error);
      }
    }

    // Fallback to legacy processing if enhanced fails or no files
    let legacyResponse = null;
    if (!enhancedResponse) {
      console.log('📝 Using legacy chat processing pipeline');

      // Perform automated medical bill analysis if OCR texts are available
      let billAnalysis;
      if (ocrTexts.length > 0) {
        billAnalysis = analyzeMedicalBill(ocrTexts, benefits, message);
      }

      // Query enhanced RAG service for authoritative guidance
      let enhancedRAGResponse = null;
      try {
        const enhancedQuery = ocrTexts.length > 0
          ? `${message}\n\nDocument context: ${ocrTexts[0].substring(0, 500)}...`
          : message;

        enhancedRAGResponse = await enhancedRAG.getAuthoritativeGuidance(
          enhancedQuery,
          benefits ? `User benefits: ${JSON.stringify(benefits)}` : undefined,
          5
        );

        if (enhancedRAGResponse) {
          console.log('✅ Enhanced RAG response received with', enhancedRAGResponse.citations?.length || 0, 'citations');
        }
      } catch (ragError) {
        console.error('⚠️ Enhanced RAG service error:', ragError);
      }

      // Build RAG context from both traditional and enhanced sources
      const ragContext = buildRAGContext(message, ocrTexts, benefits);
      const enhancedContext = enhancedRAG.buildRAGContext(enhancedRAGResponse);

      // Format both contexts for LLM consumption
      const formattedContext = formatRAGContextForLLM(ragContext);
      const formattedEnhanced = enhancedRAG.formatRAGContextForLLM(enhancedContext);

      // Merge the formatted contexts
      const lawBasis = [
        ...(formattedContext.lawBasis || []),
        ...enhancedContext.lawBasis
      ];
      const policyGuidance = [
        ...(formattedContext.policyGuidance || []),
        ...enhancedContext.policyGuidance
      ];
      const enhancedGuidance = [
        ...(formattedContext.enhancedGuidance || []),
        ...enhancedContext.enhancedGuidance
      ];

      // Extract document metadata from uploaded files if available
      let documentMetadata;
      if (fileIds && fileIds.length > 0) {
        const { data: filesMetadata, error: metadataError } = await supabase
          .from('files')
          .select('document_type, processing_time, extracted_fields')
          .in('id', fileIds)
          .limit(1)
          .single();

        if (!metadataError && filesMetadata) {
          documentMetadata = {
            documentType: filesMetadata.document_type as 'medical_bill' | 'eob' | 'insurance_card' | 'lab_result' | 'unknown',
            processingTime: filesMetadata.processing_time,
            extractedFields: filesMetadata.extracted_fields ? JSON.parse(filesMetadata.extracted_fields) : {}
          };
        }
      }

      // Generate LLM response with enhanced context including OCR metadata
      legacyResponse = await generateResponse({
        userQuestion: message,
        benefits,
        ocrTexts,
        lawBasis,
        policyGuidance,
        enhancedGuidance,
        billAnalysis,
        documentMetadata
      });
    }

    // Use the enhanced response if available, otherwise use legacy
    const finalResponse = enhancedResponse ? {
      // Convert enhanced response to legacy format for UI compatibility
      reassurance_message: "I understand you're looking for help with your medical bill situation.",
      problem_summary: enhancedResponse.analysis.summary,
      missing_info: enhancedResponse.nextSteps.filter(step => step.label.includes('provide') || step.label.includes('upload')).map(step => step.label),
      errors_detected: enhancedResponse.analysis.likelyIssues.map(issue => issue.explanation),
      step_by_step: enhancedResponse.nextSteps.map(step => step.label),
      phone_script: enhancedResponse.scriptsAndLetters.phoneScripts[0]?.script || null,
      appeal_letter: enhancedResponse.scriptsAndLetters.appealLetters[0]?.letterContent || null,
      citations: enhancedResponse.analysis.likelyIssues.flatMap(issue =>
        issue.policyCitations.map(citation => ({
          label: citation.title,
          reference: citation.citation
        }))
      ),
      narrative_summary: enhancedResponse.analysis.summary,
      confidence: 85,
      // Enhanced fields
      extraction_table: enhancedResponse.extractionTable,
      scripts_and_letters: enhancedResponse.scriptsAndLetters,
      next_steps_detailed: enhancedResponse.nextSteps,
      disclaimers: enhancedResponse.disclaimers
    } : legacyResponse;

    // Create a case in the database to track this interaction
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .insert({
        session_id: sessionId,
        user_question: redactSensitiveInfo(message),
        user_benefits: benefits,
        llm_response: finalResponse,
        status: 'active'
      })
      .select()
      .single();

    if (caseError) {
      console.error('Error creating case:', caseError);
      // Continue anyway - don't fail the request if we can't save to DB
    }

    // Update file records to link them to this case
    if (caseData && fileIds && fileIds.length > 0) {
      const { error: updateError } = await supabase
        .from('files')
        .update({ case_id: caseData.id })
        .in('id', fileIds);

      if (updateError) {
        console.error('Error updating file case_ids:', updateError);
      }
    }

    // Return the final response (enhanced or legacy)
    return NextResponse.json(finalResponse);

  } catch (error: any) {
    console.error('Chat API error:', error);

    // Handle validation errors
    if (error.errors) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: error.errors
        },
        { status: 400 }
      );
    }

    // Return a user-friendly error response
    return NextResponse.json(
      {
        reassurance_message: "I understand you're looking for help with your medical bill situation.",
        problem_summary: "I'm experiencing technical difficulties right now, but I can still provide some general guidance.",
        missing_info: ["Please try your request again in a moment"],
        errors_detected: [],
        insurer_specific_guidance: [],
        law_basis: [],
        citations: [],
        step_by_step: [
          "Try refreshing the page and submitting your question again",
          "If the issue persists, you can contact your insurance company directly",
          "Consider seeking help from a patient advocate or healthcare navigator"
        ],
        if_no_then: ["Contact your state insurance department for additional assistance"],
        needs_appeal: false,
        final_checklist: ["Keep all your documentation", "Note the time and try again later"],
        links_citations: [],
        narrative_summary: "I apologize for the technical difficulty you're experiencing. Healthcare billing can be complex and frustrating, but there are always options and people who can help. While I work through this issue, don't hesitate to reach out directly to your insurance company or healthcare provider for immediate assistance. Your concerns are valid and deserve attention.",
        confidence: 30
      },
      { status: 200 }
    );
  }
}

// Rate limiting helper (basic implementation)
const rateLimitMap = new Map();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - (60 * 1000); // 1 minute window

  const requests = rateLimitMap.get(ip) || [];
  const recentRequests = requests.filter((time: number) => time > windowStart);

  if (recentRequests.length >= 10) { // Max 10 requests per minute
    return true;
  }

  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);

  return false;
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}