import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { generateResponse } from '@/lib/anthropic';
import { buildRAGContext, formatRAGContextForLLM } from '@/lib/rag';
import { chatMessageSchema } from '@/lib/validations';
import { redactSensitiveInfo } from '@/lib/validations';
import { analyzeMedicalBill } from '@/lib/medical-bill-analyzer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validatedInput = chatMessageSchema.parse(body);
    const { message, benefits, fileIds } = validatedInput;

    // Get OCR texts from uploaded files
    let ocrTexts: string[] = [];
    if (fileIds && fileIds.length > 0) {
      console.log('🔍 Fetching OCR text for file IDs:', fileIds);

      const { data: files, error: filesError } = await supabase
        .from('files')
        .select('ocr_text, file_name, document_type, ocr_confidence')
        .in('id', fileIds)
        .not('ocr_text', 'is', null);

      if (filesError) {
        console.error('❌ Error fetching files:', filesError);
      } else {
        console.log('📄 Found files with OCR data:', files?.length || 0);
        files?.forEach((file, index) => {
          console.log(`   File ${index + 1}: ${file.file_name}, Type: ${file.document_type}, Confidence: ${file.ocr_confidence}%, Text length: ${file.ocr_text?.length || 0} chars`);
        });

        ocrTexts = files
          .map(file => file.ocr_text)
          .filter(text => text && text.trim().length > 0);

        console.log('✅ Extracted OCR texts:', ocrTexts.length, 'texts, total length:', ocrTexts.join('').length, 'chars');
      }
    } else {
      console.log('📭 No file IDs provided for OCR processing');
    }

    // Perform automated medical bill analysis if OCR texts are available
    let billAnalysis;
    if (ocrTexts.length > 0) {
      billAnalysis = analyzeMedicalBill(ocrTexts, benefits, message);
    }

    // Build RAG context from user input and files
    const ragContext = buildRAGContext(message, ocrTexts, benefits);
    const { lawBasis, policyGuidance, enhancedGuidance } = formatRAGContextForLLM(ragContext);

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
    const llmResponse = await generateResponse({
      userQuestion: message,
      benefits,
      ocrTexts,
      lawBasis,
      policyGuidance,
      enhancedGuidance,
      billAnalysis,
      documentMetadata
    });

    // Create a case in the database to track this interaction
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .insert({
        session_id: sessionId,
        user_question: redactSensitiveInfo(message),
        user_benefits: benefits,
        llm_response: llmResponse,
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

    // Return the LLM response
    return NextResponse.json(llmResponse);

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