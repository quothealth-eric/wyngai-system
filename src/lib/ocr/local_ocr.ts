import { createWorker } from 'tesseract.js';
import { OCRResult, OCRToken, OCRKeyValue, OCRTable } from '@/types/ocr';

export class LocalOCRService {
  private tesseractWorker: any = null;

  /**
   * Local OCR using Tesseract with LSTM and layout parsing
   * Final fallback when cloud services are unavailable
   */
  public async processDocument(buffer: Buffer, mimeType: string): Promise<OCRResult> {
    console.log('🏠 Processing document with local OCR (Tesseract)...');

    try {
      await this.initializeTesseract();

      // Configure Tesseract for medical/billing documents
      await this.configureTesseract();

      const { data } = await this.tesseractWorker.recognize(buffer);

      console.log(`✅ Local OCR completed with ${data.confidence}% confidence`);

      return this.normalizeTesseractResult(data);

    } catch (error) {
      console.error('❌ Local OCR failed:', error);
      throw error;
    } finally {
      // Keep worker alive for potential reuse
    }
  }

  private async initializeTesseract(): Promise<void> {
    if (!this.tesseractWorker) {
      console.log('🔧 Initializing Tesseract worker...');

      this.tesseractWorker = await createWorker();
      await this.tesseractWorker.loadLanguage('eng');
      await this.tesseractWorker.initialize('eng');

      console.log('✅ Tesseract worker initialized');
    }
  }

  private async configureTesseract(): Promise<void> {
    // Configure Tesseract for better medical/billing document recognition
    await this.tesseractWorker.setParameters({
      // Character whitelist for medical/billing documents
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,()-/$#@: ',

      // Page segmentation mode - automatic with orientation and script detection
      tessedit_pageseg_mode: '1',

      // OCR Engine Mode - LSTM only
      tessedit_ocr_engine_mode: '1',

      // Preserve interword spaces
      preserve_interword_spaces: '1',

      // Language model weight
      language_model_penalty_non_freq_dict_word: '0.1',
      language_model_penalty_non_dict_word: '0.15',

      // Better numeric recognition for amounts
      classify_bln_numeric_mode: '1',

      // Improve table recognition
      textord_tabfind_find_tables: '1'
    });
  }

  private normalizeTesseractResult(tesseractData: any): OCRResult {
    const tokens: OCRToken[] = [];
    const kvs: OCRKeyValue[] = [];
    const tables: OCRTable[] = [];

    // Convert Tesseract words to our token format
    if (tesseractData.words) {
      tesseractData.words.forEach((word: any, index: number) => {
        if (word.text && word.text.trim()) {
          tokens.push({
            text: word.text.trim(),
            bbox: [
              word.bbox.x0,
              word.bbox.y0,
              word.bbox.x1 - word.bbox.x0,
              word.bbox.y1 - word.bbox.y0
            ],
            conf: word.confidence / 100,
            page: 1 // Tesseract processes one page at a time
          });
        }
      });
    }

    // Extract key-value pairs using layout analysis
    if (tesseractData.lines) {
      const extractedKVs = this.extractKeyValuePairs(tesseractData.lines);
      kvs.push(...extractedKVs);
    }

    // Attempt table detection from layout
    if (tesseractData.paragraphs) {
      const detectedTables = this.detectTables(tesseractData.paragraphs, tokens);
      tables.push(...detectedTables);
    }

    return {
      tokens,
      kvs,
      tables,
      metadata: {
        engine: 'tesseract',
        pages: 1,
        docTypeHint: this.inferDocumentType(tokens)
      }
    };
  }

  private extractKeyValuePairs(lines: any[]): OCRKeyValue[] {
    const kvs: OCRKeyValue[] = [];

    for (const line of lines) {
      if (!line.text || line.text.trim().length < 3) continue;

      const text = line.text.trim();

      // Look for key-value patterns common in medical billing
      const kvPatterns = [
        // Pattern: "Key: Value"
        /^([^:]+):\s*(.+)$/,
        // Pattern: "Key Value" (where key is caps/title case)
        /^([A-Z][A-Za-z\s]{2,15})\s+([A-Za-z0-9\$\.,\-\s]{3,})$/,
        // Pattern: "Account # 12345"
        /^(Account\s*#?|Patient\s*ID|Member\s*ID|Claim\s*#?)\s*:?\s*([A-Z0-9\-]{3,})$/i,
        // Pattern: "Date: MM/DD/YYYY"
        /^(Date|DOS|Service\s*Date)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})$/i
      ];

      for (const pattern of kvPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[2]) {
          kvs.push({
            key: match[1].trim(),
            value: match[2].trim(),
            bbox: [
              line.bbox.x0,
              line.bbox.y0,
              line.bbox.x1 - line.bbox.x0,
              line.bbox.y1 - line.bbox.y0
            ],
            page: 1
          });
          break;
        }
      }
    }

    return kvs;
  }

  private detectTables(paragraphs: any[], tokens: OCRToken[]): OCRTable[] {
    const tables: OCRTable[] = [];

    // Simple table detection based on alignment and patterns
    // Look for paragraphs that contain tabular data patterns

    const potentialTableParagraphs = paragraphs.filter(para => {
      const text = para.text || '';

      // Check for table-like patterns
      const hasMultipleNumbers = (text.match(/\$?\d+\.?\d*/g) || []).length >= 2;
      const hasTabularSeparators = /\s{3,}|\t/.test(text);
      const hasCodePattern = /\b\d{5}\b/.test(text); // CPT codes

      return hasMultipleNumbers && (hasTabularSeparators || hasCodePattern);
    });

    if (potentialTableParagraphs.length > 0) {
      // Group consecutive table paragraphs
      const tableRows: OCRToken[][] = [];

      for (const para of potentialTableParagraphs) {
        // Get tokens that belong to this paragraph
        const paraTokens = tokens.filter(token =>
          this.isTokenInBoundingBox(token, para.bbox)
        );

        if (paraTokens.length > 0) {
          // Sort tokens by x-coordinate to get proper column order
          paraTokens.sort((a, b) => a.bbox[0] - b.bbox[0]);

          const tableCells = paraTokens.map(token => ({
            text: token.text,
            bbox: token.bbox,
            conf: token.conf,
            page: token.page
          }));

          tableRows.push(tableCells);
        }
      }

      if (tableRows.length > 0) {
        tables.push({
          page: 1,
          rows: tableRows
        });
      }
    }

    return tables;
  }

  private isTokenInBoundingBox(token: OCRToken, bbox: any): boolean {
    const tokenCenterX = token.bbox[0] + token.bbox[2] / 2;
    const tokenCenterY = token.bbox[1] + token.bbox[3] / 2;

    return (
      tokenCenterX >= bbox.x0 &&
      tokenCenterX <= bbox.x1 &&
      tokenCenterY >= bbox.y0 &&
      tokenCenterY <= bbox.y1
    );
  }

  private inferDocumentType(tokens: OCRToken[]): string {
    const allText = tokens.map(t => t.text).join(' ').toLowerCase();

    if (allText.includes('explanation of benefits') || allText.includes('eob')) {
      return 'eob';
    }

    if (allText.includes('statement') || allText.includes('bill') || allText.includes('invoice')) {
      return 'bill';
    }

    if (allText.includes('denial') || allText.includes('appeal') || allText.includes('grievance')) {
      return 'letter';
    }

    if (allText.includes('member id') || allText.includes('group number')) {
      return 'insurance_card';
    }

    if (allText.includes('portal') || allText.includes('login') || allText.includes('dashboard')) {
      return 'portal';
    }

    return 'unknown';
  }

  public async cleanup(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
      console.log('🧹 Tesseract worker terminated');
    }
  }
}