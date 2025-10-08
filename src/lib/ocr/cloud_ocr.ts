import { OCRResult, OCRToken, OCRKeyValue, OCRTable } from '@/types/ocr';

export class CloudOCRService {
  /**
   * Primary cloud OCR using AWS Textract with Google Document AI fallback
   * Returns normalized OCR structure
   */
  public async processDocument(buffer: Buffer, mimeType: string): Promise<OCRResult> {
    console.log('☁️ Processing document with cloud OCR...');

    try {
      // Try AWS Textract first (if configured)
      if (process.env.AWS_TEXTRACT_ENABLED === 'true') {
        console.log('🔍 Attempting AWS Textract...');
        return await this.processWithTextract(buffer, mimeType);
      }
    } catch (error) {
      console.warn('⚠️ AWS Textract failed, trying Google Document AI:', error);
    }

    try {
      // Fallback to Google Document AI (if configured)
      if (process.env.GOOGLE_DOCAI_ENABLED === 'true') {
        console.log('🔍 Attempting Google Document AI...');
        return await this.processWithDocumentAI(buffer, mimeType);
      }
    } catch (error) {
      console.error('❌ Google Document AI failed:', error);
    }

    // If no cloud services available, throw error to trigger local fallback
    throw new Error('No cloud OCR services available or configured');
  }

  private async processWithTextract(buffer: Buffer, mimeType: string): Promise<OCRResult> {
    // In production, this would use AWS SDK to call Textract
    // For now, we'll simulate the structure and throw to trigger fallback

    const isExpenseDocument = this.detectExpenseDocument(buffer);

    if (isExpenseDocument) {
      // Would call textract.analyzeExpense() for better expense field extraction
      console.log('📊 Document appears to be expense-related, using AnalyzeExpense...');
    } else {
      // Would call textract.analyzeDocument() with FORMS and TABLES features
      console.log('📄 Using standard document analysis...');
    }

    // Simulate AWS SDK call structure
    throw new Error('AWS Textract not configured - add AWS credentials and set AWS_TEXTRACT_ENABLED=true');

    // Production implementation would look like:
    /*
    const textract = new AWS.Textract({
      region: process.env.AWS_REGION || 'us-east-1'
    });

    const params = {
      Document: {
        Bytes: buffer
      },
      FeatureTypes: ['FORMS', 'TABLES']
    };

    if (isExpenseDocument) {
      const result = await textract.analyzeExpense(params).promise();
      return this.normalizeTextractExpenseResult(result);
    } else {
      const result = await textract.analyzeDocument(params).promise();
      return this.normalizeTextractResult(result);
    }
    */
  }

  private async processWithDocumentAI(buffer: Buffer, mimeType: string): Promise<OCRResult> {
    // In production, this would use Google Cloud Document AI
    // For now, we'll simulate and throw to trigger fallback

    console.log('📝 Processing with Google Document AI...');

    // Would determine processor based on document type
    const processorId = this.selectDocumentAIProcessor(buffer);

    throw new Error('Google Document AI not configured - add credentials and set GOOGLE_DOCAI_ENABLED=true');

    // Production implementation would look like:
    /*
    const {DocumentProcessorServiceClient} = require('@google-cloud/documentai');
    const client = new DocumentProcessorServiceClient();

    const request = {
      name: `projects/${process.env.GOOGLE_PROJECT_ID}/locations/${process.env.GOOGLE_DOCAI_LOCATION}/processors/${processorId}`,
      rawDocument: {
        content: buffer.toString('base64'),
        mimeType: mimeType
      }
    };

    const [result] = await client.processDocument(request);
    return this.normalizeDocumentAIResult(result);
    */
  }

  private detectExpenseDocument(buffer: Buffer): boolean {
    // Heuristics to detect if document is expense/billing related
    const text = buffer.toString('utf8', 0, Math.min(2048, buffer.length)).toLowerCase();

    const expenseIndicators = [
      'invoice', 'bill', 'statement', 'charge', 'amount due', 'total',
      'explanation of benefits', 'eob', 'patient responsibility',
      'allowed amount', 'plan paid', 'deductible', 'copay'
    ];

    return expenseIndicators.some(indicator => text.includes(indicator));
  }

  private selectDocumentAIProcessor(buffer: Buffer): string {
    // Select appropriate Document AI processor based on content
    const text = buffer.toString('utf8', 0, Math.min(1024, buffer.length)).toLowerCase();

    if (text.includes('invoice') || text.includes('bill')) {
      return process.env.GOOGLE_DOCAI_INVOICE_PROCESSOR || 'invoice-processor';
    }

    if (text.includes('form') || text.includes('application')) {
      return process.env.GOOGLE_DOCAI_FORM_PROCESSOR || 'form-processor';
    }

    // Default to general processor
    return process.env.GOOGLE_DOCAI_GENERAL_PROCESSOR || 'general-processor';
  }

  // These would be implemented to normalize results from cloud services
  private normalizeTextractResult(result: any): OCRResult {
    const tokens: OCRToken[] = [];
    const kvs: OCRKeyValue[] = [];
    const tables: OCRTable[] = [];

    // Normalize Textract response to our standard format
    // This would parse result.Blocks and convert to our types

    return {
      tokens,
      kvs,
      tables,
      metadata: {
        engine: 'textract',
        pages: 1, // Would extract from result
        docTypeHint: 'unknown'
      }
    };
  }

  private normalizeTextractExpenseResult(result: any): OCRResult {
    const tokens: OCRToken[] = [];
    const kvs: OCRKeyValue[] = [];
    const tables: OCRTable[] = [];

    // Normalize Textract AnalyzeExpense response
    // This would parse result.ExpenseDocuments and convert to our types

    return {
      tokens,
      kvs,
      tables,
      metadata: {
        engine: 'textract',
        pages: 1,
        docTypeHint: 'expense'
      }
    };
  }

  private normalizeDocumentAIResult(result: any): OCRResult {
    const tokens: OCRToken[] = [];
    const kvs: OCRKeyValue[] = [];
    const tables: OCRTable[] = [];

    // Normalize Document AI response to our standard format
    // This would parse result.document and convert to our types

    return {
      tokens,
      kvs,
      tables,
      metadata: {
        engine: 'docai',
        pages: 1,
        docTypeHint: 'unknown'
      }
    };
  }
}