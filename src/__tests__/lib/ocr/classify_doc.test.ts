import { DocumentClassifier } from '@/lib/ocr/classify_doc';
import { OCRResult } from '@/types/ocr';

describe('DocumentClassifier', () => {
  let classifier: DocumentClassifier;

  beforeEach(() => {
    classifier = new DocumentClassifier();
  });

  describe('classifyDocument', () => {
    const mockBuffer = Buffer.from('mock pdf content');

    it('should classify EOB documents correctly', () => {
      const mockOCRResult: OCRResult = {
        tokens: [
          { text: 'EXPLANATION', bbox: [0, 0, 100, 20], conf: 0.9, page: 1 },
          { text: 'OF', bbox: [100, 0, 120, 20], conf: 0.9, page: 1 },
          { text: 'BENEFITS', bbox: [120, 0, 200, 20], conf: 0.9, page: 1 },
          { text: 'Allowed', bbox: [0, 30, 80, 50], conf: 0.9, page: 1 },
          { text: 'Amount', bbox: [80, 30, 130, 50], conf: 0.9, page: 1 },
          { text: 'Plan', bbox: [0, 60, 50, 80], conf: 0.9, page: 1 },
          { text: 'Paid', bbox: [50, 60, 80, 80], conf: 0.9, page: 1 }
        ],
        kvs: [],
        tables: [],
        metadata: { engine: 'tesseract', pages: 1 }
      };

      const result = classifier.classifyDocument(
        mockBuffer,
        'eob_document.pdf',
        'application/pdf',
        mockOCRResult
      );

      expect(result.docType).toBe('EOB');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify BILL documents correctly', () => {
      const mockOCRResult: OCRResult = {
        tokens: [
          { text: 'ITEMIZED', bbox: [0, 0, 100, 20], conf: 0.9, page: 1 },
          { text: 'STATEMENT', bbox: [100, 0, 200, 20], conf: 0.9, page: 1 },
          { text: 'Amount', bbox: [0, 30, 80, 50], conf: 0.9, page: 1 },
          { text: 'Due', bbox: [80, 30, 120, 50], conf: 0.9, page: 1 },
          { text: 'Procedure', bbox: [0, 60, 100, 80], conf: 0.9, page: 1 },
          { text: 'Code', bbox: [100, 60, 140, 80], conf: 0.9, page: 1 },
          { text: '99213', bbox: [0, 90, 50, 110], conf: 0.9, page: 1 }
        ],
        kvs: [],
        tables: [],
        metadata: { engine: 'tesseract', pages: 1 }
      };

      const result = classifier.classifyDocument(
        mockBuffer,
        'medical_bill.pdf',
        'application/pdf',
        mockOCRResult
      );

      expect(result.docType).toBe('BILL');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify LETTER documents correctly', () => {
      const mockOCRResult: OCRResult = {
        tokens: [
          { text: 'Dear', bbox: [0, 0, 40, 20], conf: 0.9, page: 1 },
          { text: 'Patient', bbox: [40, 0, 100, 20], conf: 0.9, page: 1 },
          { text: 'Denial', bbox: [0, 30, 60, 50], conf: 0.9, page: 1 },
          { text: 'Appeal', bbox: [0, 60, 60, 80], conf: 0.9, page: 1 },
          { text: 'Medical', bbox: [0, 90, 70, 110], conf: 0.9, page: 1 },
          { text: 'Necessity', bbox: [70, 90, 150, 110], conf: 0.9, page: 1 },
          { text: 'Sincerely', bbox: [0, 120, 80, 140], conf: 0.9, page: 1 }
        ],
        kvs: [],
        tables: [],
        metadata: { engine: 'tesseract', pages: 1 }
      };

      const result = classifier.classifyDocument(
        mockBuffer,
        'denial_letter.pdf',
        'application/pdf',
        mockOCRResult
      );

      expect(result.docType).toBe('LETTER');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should return UNKNOWN for unrecognizable documents', () => {
      const mockOCRResult: OCRResult = {
        tokens: [
          { text: 'Random', bbox: [0, 0, 60, 20], conf: 0.9, page: 1 },
          { text: 'Text', bbox: [60, 0, 100, 20], conf: 0.9, page: 1 },
          { text: 'Content', bbox: [0, 30, 80, 50], conf: 0.9, page: 1 }
        ],
        kvs: [],
        tables: [],
        metadata: { engine: 'tesseract', pages: 1 }
      };

      const result = classifier.classifyDocument(
        mockBuffer,
        'unknown_doc.pdf',
        'application/pdf',
        mockOCRResult
      );

      expect(result.docType).toBe('UNKNOWN');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle missing OCR result gracefully', () => {
      const result = classifier.classifyDocument(
        mockBuffer,
        'no_ocr.pdf',
        'application/pdf'
      );

      expect(result.docType).toBe('UNKNOWN');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should use filename hints for classification', () => {
      const mockOCRResult: OCRResult = {
        tokens: [
          { text: 'Some', bbox: [0, 0, 50, 20], conf: 0.9, page: 1 },
          { text: 'Text', bbox: [50, 0, 90, 20], conf: 0.9, page: 1 }
        ],
        kvs: [],
        tables: [],
        metadata: { engine: 'tesseract', pages: 1 }
      };

      const result = classifier.classifyDocument(
        mockBuffer,
        'eob_benefits_explanation.pdf',
        'application/pdf',
        mockOCRResult
      );

      // Filename should boost EOB classification
      expect(result.confidence).toBeGreaterThan(0.2);
    });
  });
});