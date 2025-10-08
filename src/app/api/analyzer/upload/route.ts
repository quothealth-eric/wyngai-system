import { NextRequest, NextResponse } from 'next/server';
import { DocumentClassifier } from '@/lib/ocr/classify_doc';
import { ClaimFieldExtractor } from '@/lib/ocr/extract_claim_fields';
import { PDFTextDetector } from '@/lib/ocr/detect_pdf_text';
import { CloudOCRService } from '@/lib/ocr/cloud_ocr';
import { LocalOCRService } from '@/lib/ocr/local_ocr';
import { NoBenefitsDetectionEngine } from '@/lib/detect/engine';
import { TableOutputFormatter } from '@/lib/formatters/table_formatter';
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

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Initialize services
    const pdfDetector = new PDFTextDetector();
    const cloudOCR = new CloudOCRService();
    const localOCR = new LocalOCRService();
    const classifier = new DocumentClassifier();
    const fieldExtractor = new ClaimFieldExtractor();
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

    // Step 3: Field extraction
    const artifactId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const extractedFields = fieldExtractor.extractFields(artifactId, classification.docType, ocrResult);
    console.log(`📊 Extracted ${extractedFields.lineItems.length} line items`);

    // Step 4: Create document artifact
    const documentArtifact: DocumentArtifact = {
      artifactId,
      filename: file.name,
      mime: file.type,
      docType: classification.docType,
      pages: ocrResult.metadata.pages,
      ocrConf: classification.confidence
    };

    // Step 5: Run detection engine
    const detectionContext = {
      lineItems: extractedFields.lineItems,
      totals: {
        charges: extractedFields.documentMeta.totals?.billed || 0,
        adjustments: 0,
        payments: extractedFields.documentMeta.totals?.planPaid || 0,
        balance: extractedFields.documentMeta.totals?.patientResp || 0
      },
      dates: {
        serviceDate: extractedFields.documentMeta.serviceDates?.start
      },
      provider: {
        name: extractedFields.documentMeta.providerName,
        npi: extractedFields.documentMeta.providerNPI
      },
      patient: {
        id: extractedFields.documentMeta.accountId
      },
      metadata: {
        docType: classification.docType,
        confidence: classification.confidence
      }
    };

    const detectionResults = await detectionEngine.runAllDetections(detectionContext);
    const triggeredDetections = detectionResults.filter(r => r.triggered);
    console.log(`🔍 Detection complete: ${triggeredDetections.length}/${detectionResults.length} rules triggered`);

    // Step 6: Format results
    const simplifiedLineItems = extractedFields.lineItems.map(item => ({
      code: item.code,
      description: item.description,
      amount: item.charge || 0,
      serviceDate: item.dos,
      units: item.units || 1
    }));

    const formattedLineItems = formatter.formatLineItems(simplifiedLineItems, classification.confidence);
    const formattedDetections = formatter.formatDetections(detectionResults);
    const formattedProvider = formatter.formatProviderInfo(detectionContext.provider);
    const formattedFinancials = formatter.formatFinancialSummary(detectionContext.totals);

    // Step 7: Calculate statistics
    const stats = detectionEngine.getDetectionStatistics(detectionResults);

    // Return comprehensive analysis results
    const response = {
      success: true,
      document: {
        filename: file.name,
        type: classification.docType,
        confidence: classification.confidence,
        size: file.size,
        pages: ocrResult.metadata.pages || 1
      },
      extraction: {
        engine: ocrResult.metadata.engine,
        lineItemCount: extractedFields.lineItems.length,
        totalCharges: detectionContext.totals.charges,
        confidence: classification.confidence
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

export async function GET() {
  return NextResponse.json({
    message: 'Bill Analyzer Upload Endpoint',
    methods: ['POST'],
    maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
    supportedTypes: ALLOWED_TYPES,
    features: [
      'Hybrid OCR (vector text → cloud → local)',
      'Document classification (EOB, BILL, LETTER, etc.)',
      'Structured field extraction',
      '18 no-benefits detection rules',
      'User-friendly formatted output'
    ]
  });
}