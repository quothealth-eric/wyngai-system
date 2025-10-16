import { VectorTextDetector } from '@/lib/ocr/detect_pdf_text';

describe('VectorTextDetector', () => {
  let detector: VectorTextDetector;

  beforeEach(() => {
    detector = new VectorTextDetector();
  });

  describe('extractVectorText', () => {
    it('should extract text from PDF with vector text', async () => {
      // Mock PDF data - in real implementation would use pdf-parse
      const mockPdfBuffer = Buffer.from('mock-pdf-content');

      // Mock pdf-parse module
      const mockPdfParse = jest.fn().mockResolvedValue({
        text: 'Sample PDF text content\nLine 2 with more text',
        numpages: 1,
        info: {
          Title: 'Test PDF',
          Creator: 'Test Creator'
        }
      });

      jest.doMock('pdf-parse', () => mockPdfParse);

      const result = await detector.extractVectorText(mockPdfBuffer);

      expect(result.success).toBe(true);
      expect(result.text).toBe('Sample PDF text content\nLine 2 with more text');
      expect(result.metadata.pages).toBe(1);
      expect(result.metadata.title).toBe('Test PDF');
      expect(result.metadata.hasVectorText).toBe(true);
    });

    it('should handle PDF without vector text', async () => {
      const mockPdfBuffer = Buffer.from('mock-pdf-content');

      const mockPdfParse = jest.fn().mockResolvedValue({
        text: '',
        numpages: 1,
        info: {}
      });

      jest.doMock('pdf-parse', () => mockPdfParse);

      const result = await detector.extractVectorText(mockPdfBuffer);

      expect(result.success).toBe(true);
      expect(result.text).toBe('');
      expect(result.metadata.hasVectorText).toBe(false);
    });

    it('should handle PDF parsing errors', async () => {
      const mockPdfBuffer = Buffer.from('invalid-pdf-content');

      const mockPdfParse = jest.fn().mockRejectedValue(new Error('Invalid PDF'));

      jest.doMock('pdf-parse', () => mockPdfParse);

      const result = await detector.extractVectorText(mockPdfBuffer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to extract vector text');
    });

    it('should filter low-quality text', async () => {
      const mockPdfBuffer = Buffer.from('mock-pdf-content');

      const mockPdfParse = jest.fn().mockResolvedValue({
        text: '   \n\n   \t\t   ',
        numpages: 1,
        info: {}
      });

      jest.doMock('pdf-parse', () => mockPdfParse);

      const result = await detector.extractVectorText(mockPdfBuffer);

      expect(result.success).toBe(true);
      expect(result.text).toBe('');
      expect(result.metadata.hasVectorText).toBe(false);
    });

    it('should handle non-PDF files gracefully', async () => {
      const mockImageBuffer = Buffer.from('not-a-pdf');

      const result = await detector.extractVectorText(mockImageBuffer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to extract vector text');
    });
  });

  describe('assessTextQuality', () => {
    it('should detect high quality text', () => {
      const highQualityText = 'Patient Name: John Doe\nDate of Service: 01/15/2024\nCPT Code: 99213';

      const quality = detector.assessTextQuality(highQualityText);

      expect(quality.score).toBeGreaterThan(0.8);
      expect(quality.hasStructuredData).toBe(true);
      expect(quality.hasMedicalTerms).toBe(true);
    });

    it('should detect low quality text', () => {
      const lowQualityText = 'abc def ghi jkl';

      const quality = detector.assessTextQuality(lowQualityText);

      expect(quality.score).toBeLessThan(0.3);
      expect(quality.hasStructuredData).toBe(false);
      expect(quality.hasMedicalTerms).toBe(false);
    });

    it('should handle empty text', () => {
      const quality = detector.assessTextQuality('');

      expect(quality.score).toBe(0);
      expect(quality.hasStructuredData).toBe(false);
      expect(quality.hasMedicalTerms).toBe(false);
    });
  });

  describe('convertToOCRResult', () => {
    it('should convert vector text to OCR result format', () => {
      const vectorResult = {
        success: true,
        text: 'Patient: John Doe\nAmount: $150.00\nCPT: 99213',
        metadata: {
          pages: 1,
          hasVectorText: true,
          title: 'Medical Bill'
        }
      };

      const ocrResult = detector.convertToOCRResult(vectorResult);

      expect(ocrResult.metadata.engine).toBe('vector');
      expect(ocrResult.metadata.pages).toBe(1);
      expect(ocrResult.tokens.length).toBeGreaterThan(0);

      // Should detect key-value pairs
      const kvPairs = ocrResult.kvs;
      expect(kvPairs.some(kv => kv.key.toLowerCase().includes('patient'))).toBe(true);
      expect(kvPairs.some(kv => kv.key.toLowerCase().includes('amount'))).toBe(true);
    });

    it('should handle failed vector extraction', () => {
      const vectorResult = {
        success: false,
        text: '',
        error: 'Failed to parse PDF',
        metadata: {
          pages: 0,
          hasVectorText: false
        }
      };

      const ocrResult = detector.convertToOCRResult(vectorResult);

      expect(ocrResult.metadata.engine).toBe('vector');
      expect(ocrResult.tokens).toHaveLength(0);
      expect(ocrResult.kvs).toHaveLength(0);
      expect(ocrResult.tables).toHaveLength(0);
    });
  });
});