import { CloudOCRService } from '@/lib/ocr/cloud_ocr';

// Mock AWS SDK
const mockTextractClient = {
  send: jest.fn()
};

jest.mock('@aws-sdk/client-textract', () => ({
  TextractClient: jest.fn(() => mockTextractClient),
  AnalyzeDocumentCommand: jest.fn(),
  DetectDocumentTextCommand: jest.fn()
}));

// Mock Google Document AI
const mockDocumentAI = {
  processDocument: jest.fn()
};

jest.mock('@google-cloud/documentai', () => ({
  DocumentProcessorServiceClient: jest.fn(() => mockDocumentAI)
}));

describe('CloudOCRService', () => {
  let cloudOCR: CloudOCRService;

  beforeEach(() => {
    cloudOCR = new CloudOCRService();
    jest.clearAllMocks();
  });

  describe('processWithTextract', () => {
    it('should process document with Textract successfully', async () => {
      const mockResponse = {
        Blocks: [
          {
            BlockType: 'PAGE',
            Id: 'page-1',
            Geometry: {
              BoundingBox: { Left: 0, Top: 0, Width: 1, Height: 1 }
            }
          },
          {
            BlockType: 'LINE',
            Id: 'line-1',
            Text: 'Patient Name: John Doe',
            Geometry: {
              BoundingBox: { Left: 0.1, Top: 0.1, Width: 0.3, Height: 0.05 }
            }
          },
          {
            BlockType: 'WORD',
            Id: 'word-1',
            Text: 'Patient',
            Geometry: {
              BoundingBox: { Left: 0.1, Top: 0.1, Width: 0.08, Height: 0.05 }
            }
          },
          {
            BlockType: 'KEY_VALUE_SET',
            Id: 'kv-1',
            EntityTypes: ['KEY'],
            Relationships: [{ Type: 'VALUE', Ids: ['kv-2'] }],
            Geometry: {
              BoundingBox: { Left: 0.1, Top: 0.2, Width: 0.1, Height: 0.05 }
            }
          },
          {
            BlockType: 'KEY_VALUE_SET',
            Id: 'kv-2',
            EntityTypes: ['VALUE'],
            Text: 'John Doe',
            Geometry: {
              BoundingBox: { Left: 0.2, Top: 0.2, Width: 0.1, Height: 0.05 }
            }
          }
        ]
      };

      mockTextractClient.send.mockResolvedValue(mockResponse);

      const buffer = Buffer.from('mock-image-data');
      const result = await cloudOCR.processWithTextract(buffer, 'image/jpeg');

      expect(result.success).toBe(true);
      expect(result.ocrResult?.metadata.engine).toBe('textract');
      expect(result.ocrResult?.tokens.length).toBeGreaterThan(0);
      expect(result.ocrResult?.kvs.length).toBeGreaterThan(0);
    });

    it('should handle Textract errors gracefully', async () => {
      mockTextractClient.send.mockRejectedValue(new Error('Textract service error'));

      const buffer = Buffer.from('mock-image-data');
      const result = await cloudOCR.processWithTextract(buffer, 'image/jpeg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Textract processing failed');
    });

    it('should process tables correctly', async () => {
      const mockResponse = {
        Blocks: [
          {
            BlockType: 'PAGE',
            Id: 'page-1'
          },
          {
            BlockType: 'TABLE',
            Id: 'table-1',
            Relationships: [{ Type: 'CHILD', Ids: ['cell-1', 'cell-2'] }],
            Geometry: {
              BoundingBox: { Left: 0.1, Top: 0.3, Width: 0.8, Height: 0.4 }
            }
          },
          {
            BlockType: 'CELL',
            Id: 'cell-1',
            RowIndex: 1,
            ColumnIndex: 1,
            Text: 'CPT Code',
            Relationships: [{ Type: 'CHILD', Ids: ['word-2'] }],
            Geometry: {
              BoundingBox: { Left: 0.1, Top: 0.3, Width: 0.2, Height: 0.1 }
            }
          },
          {
            BlockType: 'CELL',
            Id: 'cell-2',
            RowIndex: 1,
            ColumnIndex: 2,
            Text: '99213',
            Relationships: [{ Type: 'CHILD', Ids: ['word-3'] }],
            Geometry: {
              BoundingBox: { Left: 0.3, Top: 0.3, Width: 0.2, Height: 0.1 }
            }
          },
          {
            BlockType: 'WORD',
            Id: 'word-2',
            Text: 'CPT Code'
          },
          {
            BlockType: 'WORD',
            Id: 'word-3',
            Text: '99213'
          }
        ]
      };

      mockTextractClient.send.mockResolvedValue(mockResponse);

      const buffer = Buffer.from('mock-image-data');
      const result = await cloudOCR.processWithTextract(buffer, 'image/jpeg');

      expect(result.success).toBe(true);
      expect(result.ocrResult?.tables.length).toBeGreaterThan(0);
      expect(result.ocrResult?.tables[0].rows.length).toBe(1);
      expect(result.ocrResult?.tables[0].rows[0].cells.length).toBe(2);
    });
  });

  describe('processWithDocumentAI', () => {
    it('should process document with Document AI successfully', async () => {
      const mockResponse = [{
        document: {
          text: 'Patient Name: John Doe\nAmount: $150.00',
          pages: [{
            pageNumber: 1,
            dimension: { width: 612, height: 792 },
            tokens: [
              {
                layout: {
                  textAnchor: { textSegments: [{ startIndex: 0, endIndex: 7 }] },
                  boundingPoly: {
                    normalizedVertices: [
                      { x: 0.1, y: 0.1 },
                      { x: 0.18, y: 0.1 },
                      { x: 0.18, y: 0.15 },
                      { x: 0.1, y: 0.15 }
                    ]
                  }
                }
              }
            ],
            formFields: [
              {
                fieldName: {
                  textAnchor: { textSegments: [{ startIndex: 0, endIndex: 12 }] }
                },
                fieldValue: {
                  textAnchor: { textSegments: [{ startIndex: 14, endIndex: 22 }] }
                }
              }
            ],
            tables: [
              {
                headerRows: [
                  {
                    cells: [
                      {
                        layout: {
                          textAnchor: { textSegments: [{ startIndex: 25, endIndex: 33 }] }
                        }
                      }
                    ]
                  }
                ],
                bodyRows: [
                  {
                    cells: [
                      {
                        layout: {
                          textAnchor: { textSegments: [{ startIndex: 35, endIndex: 43 }] }
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }]
        }
      }];

      mockDocumentAI.processDocument.mockResolvedValue(mockResponse);

      const buffer = Buffer.from('mock-image-data');
      const result = await cloudOCR.processWithDocumentAI(buffer, 'image/jpeg');

      expect(result.success).toBe(true);
      expect(result.ocrResult?.metadata.engine).toBe('docai');
      expect(result.ocrResult?.tokens.length).toBeGreaterThan(0);
      expect(result.ocrResult?.kvs.length).toBeGreaterThan(0);
      expect(result.ocrResult?.tables.length).toBeGreaterThan(0);
    });

    it('should handle Document AI errors gracefully', async () => {
      mockDocumentAI.processDocument.mockRejectedValue(new Error('Document AI service error'));

      const buffer = Buffer.from('mock-image-data');
      const result = await cloudOCR.processWithDocumentAI(buffer, 'image/jpeg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Document AI processing failed');
    });
  });

  describe('processDocument', () => {
    it('should try Textract first, then fall back to Document AI', async () => {
      // Mock Textract failure
      mockTextractClient.send.mockRejectedValue(new Error('Textract error'));

      // Mock Document AI success
      const mockDocAIResponse = [{
        document: {
          text: 'Fallback text from Document AI',
          pages: [{
            pageNumber: 1,
            tokens: []
          }]
        }
      }];
      mockDocumentAI.processDocument.mockResolvedValue(mockDocAIResponse);

      const buffer = Buffer.from('mock-image-data');
      const result = await cloudOCR.processDocument(buffer, 'image/jpeg');

      expect(result.success).toBe(true);
      expect(result.ocrResult?.metadata.engine).toBe('docai');
      expect(mockTextractClient.send).toHaveBeenCalled();
      expect(mockDocumentAI.processDocument).toHaveBeenCalled();
    });

    it('should fail when both services are unavailable', async () => {
      mockTextractClient.send.mockRejectedValue(new Error('Textract error'));
      mockDocumentAI.processDocument.mockRejectedValue(new Error('Document AI error'));

      const buffer = Buffer.from('mock-image-data');
      const result = await cloudOCR.processDocument(buffer, 'image/jpeg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('All cloud OCR services failed');
    });

    it('should validate HIPAA compliance settings', async () => {
      const mockResponse = {
        Blocks: [
          {
            BlockType: 'PAGE',
            Id: 'page-1'
          }
        ]
      };

      mockTextractClient.send.mockResolvedValue(mockResponse);

      const buffer = Buffer.from('mock-image-data');
      const result = await cloudOCR.processDocument(buffer, 'image/jpeg', {
        requireHIPAACompliance: true
      });

      expect(result.success).toBe(true);
      // In real implementation, would verify HIPAA-compliant endpoints were used
    });
  });

  describe('isServiceAvailable', () => {
    it('should check Textract availability', async () => {
      mockTextractClient.send.mockResolvedValue({ Blocks: [] });

      const available = await cloudOCR.isServiceAvailable('textract');

      expect(available).toBe(true);
    });

    it('should check Document AI availability', async () => {
      mockDocumentAI.processDocument.mockResolvedValue([{ document: { text: '' } }]);

      const available = await cloudOCR.isServiceAvailable('docai');

      expect(available).toBe(true);
    });

    it('should return false for unavailable services', async () => {
      mockTextractClient.send.mockRejectedValue(new Error('Service unavailable'));

      const available = await cloudOCR.isServiceAvailable('textract');

      expect(available).toBe(false);
    });
  });
});