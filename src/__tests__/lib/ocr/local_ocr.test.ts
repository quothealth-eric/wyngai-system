import { LocalOCRService } from '@/lib/ocr/local_ocr';

// Mock Tesseract.js - this is already mocked in jest.setup.js but we'll override for specific tests
const mockWorker = {
  loadLanguage: jest.fn().mockResolvedValue(undefined),
  initialize: jest.fn().mockResolvedValue(undefined),
  setParameters: jest.fn().mockResolvedValue(undefined),
  recognize: jest.fn(),
  terminate: jest.fn().mockResolvedValue(undefined)
};

const mockCreateWorker = jest.fn(() => mockWorker);

jest.mock('tesseract.js', () => ({
  createWorker: mockCreateWorker
}));

describe('LocalOCRService', () => {
  let localOCR: LocalOCRService;

  beforeEach(() => {
    localOCR = new LocalOCRService();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await localOCR.cleanup();
  });

  describe('processDocument', () => {
    it('should process document successfully with high confidence', async () => {
      const mockRecognitionResult = {
        data: {
          text: 'Patient Name: John Doe\nDate of Service: 01/15/2024\nCPT Code: 99213\nAmount: $150.00',
          confidence: 87,
          words: [
            {
              text: 'Patient',
              bbox: { x0: 10, y0: 10, x1: 70, y1: 30 },
              confidence: 90
            },
            {
              text: 'Name:',
              bbox: { x0: 75, y0: 10, x1: 115, y1: 30 },
              confidence: 95
            },
            {
              text: 'John',
              bbox: { x0: 120, y0: 10, x1: 150, y1: 30 },
              confidence: 88
            },
            {
              text: 'Doe',
              bbox: { x0: 155, y0: 10, x1: 185, y1: 30 },
              confidence: 92
            }
          ],
          lines: [
            {
              text: 'Patient Name: John Doe',
              bbox: { x0: 10, y0: 10, x1: 185, y1: 30 }
            },
            {
              text: 'Date of Service: 01/15/2024',
              bbox: { x0: 10, y0: 40, x1: 200, y1: 60 }
            }
          ],
          paragraphs: [
            {
              text: 'Patient Name: John Doe\nDate of Service: 01/15/2024',
              bbox: { x0: 10, y0: 10, x1: 200, y1: 60 }
            }
          ]
        }
      };

      mockWorker.recognize.mockResolvedValue(mockRecognitionResult);

      const buffer = Buffer.from('mock-image-data');
      const result = await localOCR.processDocument(buffer, 'image/jpeg');

      expect(result.success).toBe(true);
      expect(result.ocrResult?.metadata.engine).toBe('tesseract');
      expect(result.ocrResult?.tokens.length).toBe(4); // Number of words
      expect(result.ocrResult?.kvs.length).toBeGreaterThan(0);

      // Verify worker setup
      expect(mockWorker.loadLanguage).toHaveBeenCalledWith('eng');
      expect(mockWorker.initialize).toHaveBeenCalledWith('eng');
      expect(mockWorker.setParameters).toHaveBeenCalled();
    });

    it('should handle low confidence results', async () => {
      const mockRecognitionResult = {
        data: {
          text: 'poor quality text',
          confidence: 45, // Low confidence
          words: [
            {
              text: 'poor',
              bbox: { x0: 10, y0: 10, x1: 40, y1: 30 },
              confidence: 40
            }
          ],
          lines: [],
          paragraphs: []
        }
      };

      mockWorker.recognize.mockResolvedValue(mockRecognitionResult);

      const buffer = Buffer.from('mock-image-data');
      const result = await localOCR.processDocument(buffer, 'image/jpeg');

      expect(result.success).toBe(true);
      expect(result.confidence).toBeLessThan(0.7);
      expect(result.ocrResult?.metadata.confidence).toBeLessThan(0.7);
    });

    it('should handle Tesseract errors gracefully', async () => {
      mockWorker.recognize.mockRejectedValue(new Error('Tesseract processing failed'));

      const buffer = Buffer.from('mock-image-data');
      const result = await localOCR.processDocument(buffer, 'image/jpeg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Local OCR processing failed');
    });

    it('should apply medical document optimizations', async () => {
      const mockRecognitionResult = {
        data: {
          text: 'EOB Explanation of Benefits\nCPT 99213 Office Visit\nHCPCS J1234 Injection',
          confidence: 85,
          words: [],
          lines: [],
          paragraphs: []
        }
      };

      mockWorker.recognize.mockResolvedValue(mockRecognitionResult);

      const buffer = Buffer.from('mock-image-data');
      const result = await localOCR.processDocument(buffer, 'image/jpeg', {
        docTypeHint: 'EOB'
      });

      expect(result.success).toBe(true);
      expect(mockWorker.setParameters).toHaveBeenCalledWith(
        expect.objectContaining({
          tessedit_char_whitelist: expect.stringContaining('0123456789'),
          preserve_interword_spaces: '1'
        })
      );
    });

    it('should handle different image formats', async () => {
      const mockRecognitionResult = {
        data: {
          text: 'Test content',
          confidence: 80,
          words: [],
          lines: [],
          paragraphs: []
        }
      };

      mockWorker.recognize.mockResolvedValue(mockRecognitionResult);

      const buffer = Buffer.from('mock-image-data');

      // Test PNG
      await localOCR.processDocument(buffer, 'image/png');
      expect(mockWorker.recognize).toHaveBeenCalled();

      // Test PDF
      await localOCR.processDocument(buffer, 'application/pdf');
      expect(mockWorker.recognize).toHaveBeenCalled();
    });
  });

  describe('preprocessImage', () => {
    it('should apply image preprocessing for better OCR', async () => {
      const buffer = Buffer.from('mock-image-data');

      // Mock Sharp operations
      const mockSharp = {
        normalize: jest.fn().mockReturnThis(),
        sharpen: jest.fn().mockReturnThis(),
        threshold: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed-image'))
      };

      jest.doMock('sharp', () => jest.fn(() => mockSharp));

      const result = await localOCR.preprocessImage(buffer, {
        enhance: true,
        threshold: 128
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle preprocessing errors gracefully', async () => {
      const buffer = Buffer.from('invalid-image-data');

      // In real implementation, Sharp would throw an error
      const result = await localOCR.preprocessImage(buffer);

      // Should return original buffer if preprocessing fails
      expect(result).toBe(buffer);
    });
  });

  describe('optimizeForMedicalDocuments', () => {
    it('should configure parameters for medical documents', () => {
      const params = localOCR.optimizeForMedicalDocuments('EOB');

      expect(params.tessedit_char_whitelist).toContain('0123456789');
      expect(params.tessedit_char_whitelist).toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      expect(params.preserve_interword_spaces).toBe('1');
    });

    it('should use default parameters for unknown document types', () => {
      const params = localOCR.optimizeForMedicalDocuments('UNKNOWN');

      expect(params.tessedit_pageseg_mode).toBe('3'); // Default page segmentation
    });
  });

  describe('extractKeyValuePairs', () => {
    it('should extract medical billing key-value pairs', () => {
      const text = `Patient Name: John Doe
Date of Service: 01/15/2024
CPT Code: 99213
Amount Charged: $150.00
Patient Responsibility: $30.00`;

      const lines = text.split('\n').map((line, index) => ({
        text: line,
        bbox: { x0: 0, y0: index * 20, x1: 200, y1: (index + 1) * 20 }
      }));

      const kvPairs = localOCR.extractKeyValuePairs(lines);

      expect(kvPairs.length).toBeGreaterThan(0);

      const patientNameKV = kvPairs.find(kv =>
        kv.key.toLowerCase().includes('patient') &&
        kv.key.toLowerCase().includes('name')
      );
      expect(patientNameKV?.value).toBe('John Doe');

      const amountKV = kvPairs.find(kv =>
        kv.key.toLowerCase().includes('amount')
      );
      expect(amountKV?.value).toBe('$150.00');
    });

    it('should handle various key-value formats', () => {
      const text = `Name=John Doe
      Service Date (01/15/2024)
      Amount: $150.00
      Code 99213`;

      const lines = text.split('\n').map((line, index) => ({
        text: line.trim(),
        bbox: { x0: 0, y0: index * 20, x1: 200, y1: (index + 1) * 20 }
      }));

      const kvPairs = localOCR.extractKeyValuePairs(lines);

      expect(kvPairs.length).toBeGreaterThan(0);
      expect(kvPairs.some(kv => kv.value === 'John Doe')).toBe(true);
      expect(kvPairs.some(kv => kv.value === '$150.00')).toBe(true);
    });
  });

  describe('convertToOCRResult', () => {
    it('should convert Tesseract result to standard OCR format', () => {
      const tesseractData = {
        text: 'Patient Name: John Doe\nAmount: $150.00',
        confidence: 85,
        words: [
          {
            text: 'Patient',
            bbox: { x0: 10, y0: 10, x1: 70, y1: 30 },
            confidence: 90
          },
          {
            text: 'Name:',
            bbox: { x0: 75, y0: 10, x1: 115, y1: 30 },
            confidence: 95
          }
        ],
        lines: [
          {
            text: 'Patient Name: John Doe',
            bbox: { x0: 10, y0: 10, x1: 200, y1: 30 }
          }
        ],
        paragraphs: [
          {
            text: 'Patient Name: John Doe\nAmount: $150.00',
            bbox: { x0: 10, y0: 10, x1: 200, y1: 60 }
          }
        ]
      };

      const ocrResult = localOCR.convertToOCRResult(tesseractData);

      expect(ocrResult.metadata.engine).toBe('tesseract');
      expect(ocrResult.metadata.confidence).toBe(0.85);
      expect(ocrResult.tokens.length).toBe(2);
      expect(ocrResult.kvs.length).toBeGreaterThan(0);

      // Verify token structure
      const firstToken = ocrResult.tokens[0];
      expect(firstToken.text).toBe('Patient');
      expect(firstToken.confidence).toBe(0.9);
      expect(firstToken.bbox).toEqual({
        left: 10, top: 10, width: 60, height: 20
      });
    });
  });

  describe('worker management', () => {
    it('should initialize worker only once', async () => {
      const buffer = Buffer.from('mock-image-data');

      mockWorker.recognize.mockResolvedValue({
        data: { text: 'test', confidence: 80, words: [], lines: [], paragraphs: [] }
      });

      // Process multiple documents
      await localOCR.processDocument(buffer, 'image/jpeg');
      await localOCR.processDocument(buffer, 'image/jpeg');

      expect(mockCreateWorker).toHaveBeenCalledTimes(1);
      expect(mockWorker.initialize).toHaveBeenCalledTimes(1);
    });

    it('should cleanup worker on termination', async () => {
      await localOCR.cleanup();

      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('should handle worker initialization errors', async () => {
      mockWorker.initialize.mockRejectedValue(new Error('Failed to initialize worker'));

      const buffer = Buffer.from('mock-image-data');
      const result = await localOCR.processDocument(buffer, 'image/jpeg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to initialize Tesseract worker');
    });
  });
});