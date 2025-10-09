import { NextRequest, NextResponse } from 'next/server';
import { DocumentClassifier } from '@/lib/ocr/classify_doc';
import { TableAwareExtractor } from '@/lib/table-aware-extraction';
import { PDFTextDetector } from '@/lib/ocr/detect_pdf_text';
import { CloudOCRService } from '@/lib/ocr/cloud_ocr';
import { LocalOCRService } from '@/lib/ocr/local_ocr';
import { NoBenefitsDetectionEngine } from '@/lib/detect/engine';
import { TableOutputFormatter } from '@/lib/formatters/table_formatter';
import { CaseBindingManager } from '@/lib/case-binding';
import { DocumentArtifact } from '@/types/analyzer';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/tiff',
  'image/webp'
];

export async function POST(request: NextRequest) {
  console.log('📋 Processing bill analyzer upload...');

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Supported types: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    console.log(`📄 Processing file: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)`);

    // Step 1: Create case binding for strict correlation
    const caseBindingManager = CaseBindingManager.getInstance();
    const { caseId, artifactBinding } = caseBindingManager.createCaseBinding(file);

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Set artifact digest for validation
    caseBindingManager.setArtifactDigest(caseId, artifactBinding.artifactId, buffer);

    // Initialize services
    const pdfDetector = new PDFTextDetector();
    const cloudOCR = new CloudOCRService();
    const localOCR = new LocalOCRService();
    const classifier = new DocumentClassifier();
    const tableExtractor = new TableAwareExtractor();
    const detectionEngine = new NoBenefitsDetectionEngine();
    const formatter = new TableOutputFormatter();

    // Step 1: Hybrid OCR extraction
    let ocrResult;
    try {
      // Try vector text extraction for PDFs first
      if (file.type === 'application/pdf') {
        const pdfTextResult = await pdfDetector.extractText(buffer);
        if (pdfTextResult.hasExtractableText && pdfTextResult.blocks.length > 0) {
          console.log('✅ Using vector text extraction');
          ocrResult = {
            tokens: pdfTextResult.blocks.map((block: any) => ({
              text: block.text,
              bbox: block.bbox,
              conf: 0.95,
              page: block.page
            })),
            kvs: [],
            tables: [],
            metadata: {
              engine: 'vector' as const,
              pages: pdfTextResult.pages,
              docTypeHint: 'pdf_text'
            }
          };
        }
      }

      // Fallback to cloud OCR if vector extraction failed
      if (!ocrResult) {
        try {
          ocrResult = await cloudOCR.processDocument(buffer, file.type);
          console.log(`✅ Using cloud OCR: ${ocrResult.metadata.engine}`);
        } catch (cloudError) {
          console.warn('⚠️ Cloud OCR failed, using local OCR:', cloudError);
          ocrResult = await localOCR.processDocument(buffer, file.type);
          console.log('✅ Using local OCR (Tesseract)');
        }
      }
    } catch (ocrError) {
      console.error('❌ OCR processing failed:', ocrError);
      return NextResponse.json(
        { error: 'Failed to extract text from document. Please ensure the file is not corrupted and contains readable text.' },
        { status: 500 }
      );
    }

    // Step 2: Document classification
    const classification = classifier.classifyDocument(buffer, file.name, file.type, ocrResult);
    console.log(`📋 Classified as: ${classification.docType} (${(classification.confidence * 100).toFixed(1)}% confidence)`);

    // Step 3: Table-aware field extraction
    caseBindingManager.updateBindingStatus(caseId, artifactBinding.artifactId, 'processing');

    const extractedLineItems = tableExtractor.extractLineItems(
      artifactBinding.artifactId,
      caseId,
      ocrResult,
      classification.docType
    );
    console.log(`📊 Extracted ${extractedLineItems.length} line items with table-aware extraction`);

    // Step 4: Create document artifact with case binding
    const documentArtifact: DocumentArtifact = {
      artifactId: artifactBinding.artifactId,
      filename: file.name,
      mime: file.type,
      docType: classification.docType,
      pages: ocrResult.metadata.pages,
      ocrConf: classification.confidence
    };

    // Step 5: Compute totals from extracted line items
    const totals = computeTotalsFromLineItems(extractedLineItems);

    // Step 6: Run detection engine
    const detectionContext = {
      lineItems: extractedLineItems,
      totals,
      dates: {
        serviceDate: extractedLineItems[0]?.dos
      },
      provider: {
        name: extractProviderFromOCR(ocrResult),
        npi: extractNPIFromOCR(ocrResult)
      },
      patient: {
        id: extractAccountIdFromOCR(ocrResult)
      },
      metadata: {
        docType: classification.docType,
        confidence: classification.confidence,
        caseId,
        artifactId: artifactBinding.artifactId
      }
    };

    const detectionResults = await detectionEngine.runAllDetections(detectionContext);
    const triggeredDetections = detectionResults.filter(r => r.triggered);
    console.log(`🔍 Detection complete: ${triggeredDetections.length}/${detectionResults.length} rules triggered`);

    // Step 7: Format results with case correlation
    const simplifiedLineItems = extractedLineItems.map(item => ({
      lineId: item.lineId,
      code: item.code,
      description: item.description,
      amount: item.charge || 0,
      serviceDate: item.dos,
      units: item.units || 1,
      ocr: item.ocr // Include provenance
    }));

    const formattedLineItems = formatter.formatLineItems(simplifiedLineItems, classification.confidence);
    const formattedDetections = formatter.formatDetections(detectionResults);
    const formattedProvider = formatter.formatProviderInfo(detectionContext.provider);
    const formattedFinancials = formatter.formatFinancialSummary(detectionContext.totals);

    // Step 8: Calculate statistics
    const stats = detectionEngine.getDetectionStatistics(detectionResults);

    // Step 9: Mark processing complete
    caseBindingManager.updateBindingStatus(caseId, artifactBinding.artifactId, 'completed');

    // Return comprehensive analysis results with case binding
    const response = {
      success: true,
      caseId, // Include case ID for UI correlation
      document: {
        filename: file.name,
        type: classification.docType,
        confidence: classification.confidence,
        size: file.size,
        pages: ocrResult.metadata.pages || 1,
        artifactId: artifactBinding.artifactId,
        artifactDigest: artifactBinding.artifactDigest.substring(0, 8) // Partial digest for verification
      },
      extraction: {
        engine: ocrResult.metadata.engine,
        lineItemCount: extractedLineItems.length,
        totalCharges: detectionContext.totals.charges,
        confidence: classification.confidence,
        method: 'table-aware'
      },
      detection: {
        rulesRun: stats.totalRules,
        issuesFound: stats.triggeredRules,
        highSeverityCount: stats.highSeverityTriggered,
        potentialSavings: stats.totalPotentialSavings,
        averageConfidence: stats.averageConfidence
      },
      tables: {
        lineItems: formattedLineItems,
        detections: formattedDetections,
        provider: formattedProvider,
        financials: formattedFinancials
      },
      artifact: documentArtifact,
      processedAt: new Date().toISOString()
    };

    console.log(`✅ Analysis complete - ${file.name} processed successfully`);
    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Analyzer upload failed:', error);

    return NextResponse.json(
      {
        error: 'Internal server error during document analysis',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper methods for extraction
function computeTotalsFromLineItems(lineItems: any[]) {
  return {
    charges: lineItems.reduce((sum, item) => sum + (item.charge || 0), 0),
    adjustments: 0,
    payments: lineItems.reduce((sum, item) => sum + (item.planPaid || 0), 0),
    balance: lineItems.reduce((sum, item) => sum + (item.patientResp || 0), 0)
  };
}

function extractProviderFromOCR(ocrResult: any): string | undefined {
  const allText = ocrResult.tokens.map((t: any) => t.text).join(' ');
  const providerMatch = allText.match(/([A-Z][a-z]+\s+(?:Medical|Health|Hospital|Clinic|Center|Associates|Group)(?:\s+[A-Z][a-z]+)*)/);
  return providerMatch ? providerMatch[1] : undefined;
}

function extractNPIFromOCR(ocrResult: any): string | undefined {
  const allText = ocrResult.tokens.map((t: any) => t.text).join(' ');
  const npiMatch = allText.match(/NPI[:\s]*(\d{10})/i);
  return npiMatch ? npiMatch[1] : undefined;
}

function extractAccountIdFromOCR(ocrResult: any): string | undefined {
  const allText = ocrResult.tokens.map((t: any) => t.text).join(' ');
  const accountMatch = allText.match(/(?:account|patient)\s*(?:id|#)[:\s]*([A-Z0-9\-]{5,20})/i);
  return accountMatch ? accountMatch[1] : undefined;
}

export async function GET() {
  return NextResponse.json({
    message: 'Bill Analyzer Upload Endpoint - Case Binding Enhanced',
    methods: ['POST'],
    maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
    supportedTypes: ALLOWED_TYPES,
    features: [
      'Strict case binding with UUID correlation',
      'Artifact digest validation',
      'Table-aware extraction with column detection',
      'Validated CPT/HCPCS code parsing',
      'Hybrid OCR (vector text → cloud → local)',
      'Document classification (EOB, BILL, LETTER, etc.)',
      '19 no-benefits detection rules',
      'Provenance tracking with OCR coordinates'
    ]
  });
}