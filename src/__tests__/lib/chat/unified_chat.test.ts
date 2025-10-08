import { UnifiedChatEngine } from '@/lib/chat/unified_chat';
import { BenefitsContext } from '@/types/chat';

// Mock the image processor since it involves complex OCR
jest.mock('@/lib/chat/image_processor');

describe('UnifiedChatEngine', () => {
  let chatEngine: UnifiedChatEngine;

  beforeEach(() => {
    chatEngine = new UnifiedChatEngine();
    chatEngine.clearHistory();
  });

  describe('processTextQuery', () => {
    it('should process simple healthcare questions', async () => {
      const query = 'What is balance billing?';
      const result = await chatEngine.processTextQuery(query);

      expect(result.answer).toBeDefined();
      expect(result.answer.length).toBeGreaterThan(100);
      expect(result.answer.toLowerCase()).toContain('balance billing');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.originalQuery).toBe(query);
      expect(result.citations).toBeDefined();
      expect(result.metadata.responseType).toBe('text_query');
    });

    it('should handle deductible questions', async () => {
      const query = 'What is a deductible and how does it work?';
      const result = await chatEngine.processTextQuery(query);

      expect(result.answer.toLowerCase()).toContain('deductible');
      expect(result.answer.toLowerCase()).toContain('insurance');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should provide appeal guidance', async () => {
      const query = 'How do I appeal a denied insurance claim?';
      const result = await chatEngine.processTextQuery(query);

      expect(result.answer.toLowerCase()).toContain('appeal');
      expect(result.answer.toLowerCase()).toContain('internal');
      expect(result.answer.toLowerCase()).toContain('external');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should handle medical necessity questions', async () => {
      const query = 'What does medical necessity mean?';
      const result = await chatEngine.processTextQuery(query);

      expect(result.answer.toLowerCase()).toContain('medical necessity');
      expect(result.answer.toLowerCase()).toContain('appropriate');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should provide generic healthcare guidance for unknown topics', async () => {
      const query = 'Random healthcare question about something unusual';
      const result = await chatEngine.processTextQuery(query);

      expect(result.answer).toBeDefined();
      expect(result.answer.length).toBeGreaterThan(50);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should include benefits context when provided', async () => {
      const benefitsContext: BenefitsContext = {
        hasActiveBenefits: true,
        coverageDetails: {
          planType: 'HMO',
          deductible: 150000, // $1,500
          outOfPocketMax: 500000, // $5,000
          copayPrimaryCare: 2500, // $25
          coinsurance: 0.2
        },
        priorAuths: [],
        deductibleStatus: {
          yearToDate: 75000, // $750
          remaining: 75000 // $750
        }
      };

      const query = 'How much will I pay for a doctor visit?';
      const result = await chatEngine.processTextQuery(query, benefitsContext);

      expect(result.answer).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should handle conversation history', async () => {
      // First query
      const firstQuery = 'What is balance billing?';
      const firstResult = await chatEngine.processTextQuery(firstQuery);

      // Second query (follow-up)
      const secondQuery = 'How am I protected from it?';
      const secondResult = await chatEngine.processTextQuery(secondQuery);

      expect(firstResult.answer).toBeDefined();
      expect(secondResult.answer).toBeDefined();

      // History should be maintained
      const history = chatEngine.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].originalQuery).toBe(firstQuery);
      expect(history[1].originalQuery).toBe(secondQuery);
    });

    it('should limit conversation history', async () => {
      // Add more than 10 queries to test history limit
      for (let i = 0; i < 12; i++) {
        await chatEngine.processTextQuery(`Test query ${i}`);
      }

      const history = chatEngine.getHistory();
      expect(history).toHaveLength(10); // Should be limited to 10
    });

    it('should clear history correctly', () => {
      chatEngine.processTextQuery('Test query');
      chatEngine.clearHistory();

      const history = chatEngine.getHistory();
      expect(history).toHaveLength(0);
    });

    it('should calculate confidence based on question complexity', async () => {
      const simpleQuery = 'What is a copay?';
      const complexQuery = 'Explain the intricacies of prior authorization requirements for experimental procedures';

      const simpleResult = await chatEngine.processTextQuery(simpleQuery);
      const complexResult = await chatEngine.processTextQuery(complexQuery);

      expect(simpleResult.confidence).toBeDefined();
      expect(complexResult.confidence).toBeDefined();
      expect(simpleResult.confidence).toBeGreaterThan(0.7);
    });

    it('should handle error cases gracefully', async () => {
      // Test with empty query
      const emptyResult = await chatEngine.processTextQuery('');

      expect(emptyResult.answer).toBeDefined();
      expect(emptyResult.confidence).toBeGreaterThan(0);
      expect(emptyResult.metadata.responseType).toBe('text_query');
    });
  });

  describe('processImageUpload', () => {
    it('should handle image upload processing', async () => {
      const mockBuffer = Buffer.from('mock image data');
      const filename = 'test_bill.pdf';
      const mimeType = 'application/pdf';
      const userMessage = 'Please analyze this bill';

      // Since we're mocking the image processor, we need to set up the mock
      const mockImageProcessor = require('@/lib/chat/image_processor').ChatImageProcessor;
      mockImageProcessor.prototype.processUploadedDocument = jest.fn().mockResolvedValue({
        type: 'image_analysis',
        userMessage,
        documentArtifact: {
          docType: 'BILL',
          confidence: 0.85,
          lineItems: [
            {
              code: '99213',
              description: 'Office visit',
              amount: 15000,
              serviceDate: '2024-01-15'
            }
          ],
          totals: {
            charges: 15000,
            adjustments: 0,
            payments: 0,
            balance: 15000
          }
        },
        extractedTables: null,
        analysisSummary: 'Document analyzed successfully',
        benefitsContext: {
          hasActiveBenefits: false,
          coverageDetails: null,
          priorAuths: [],
          deductibleStatus: null
        },
        metadata: {
          uploadedAt: new Date().toISOString(),
          filename,
          mimeType,
          ocrEngine: 'tesseract',
          confidence: 0.85
        }
      });

      const result = await chatEngine.processImageUpload(
        mockBuffer,
        filename,
        mimeType,
        userMessage
      );

      expect(result.answer).toBeDefined();
      expect(result.answer.length).toBeGreaterThan(100);
      expect(result.metadata.responseType).toBe('image_analysis');
      expect(result.metadata.hasDocumentContext).toBe(true);
    });
  });

  describe('processFollowUpQuery', () => {
    it('should handle follow-up queries with document context', async () => {
      const previousChatCase = {
        type: 'image_analysis' as const,
        userMessage: 'Analyze this bill',
        documentArtifact: {
          docType: 'BILL' as const,
          confidence: 0.9,
          lineItems: [
            {
              code: '99213',
              description: 'Office visit',
              amount: 15000,
              serviceDate: '2024-01-15'
            }
          ],
          totals: {
            charges: 15000,
            adjustments: 0,
            payments: 0,
            balance: 15000
          }
        },
        extractedTables: null,
        analysisSummary: 'Bill analyzed',
        benefitsContext: {
          hasActiveBenefits: false,
          coverageDetails: null,
          priorAuths: [],
          deductibleStatus: null
        },
        metadata: {
          uploadedAt: new Date().toISOString(),
          ocrEngine: 'tesseract',
          confidence: 0.9
        }
      };

      const followUpQuery = 'Can you explain the office visit charge?';
      const result = await chatEngine.processFollowUpQuery(followUpQuery, previousChatCase);

      expect(result.answer).toBeDefined();
      expect(result.answer.toLowerCase()).toContain('office visit');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.metadata.responseType).toBe('image_analysis');
      expect(result.originalQuery).toBe(followUpQuery);
    });
  });
});