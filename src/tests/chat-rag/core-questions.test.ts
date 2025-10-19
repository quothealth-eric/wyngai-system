/**
 * WyngAI Central Assistant - Core Question Tests
 * Test suite for the 10 core question families
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { RAGRetriever } from '@/lib/rag/retriever';
import { QueryUnderstanding } from '@/lib/rag/query-understanding';
import { AnswerComposer } from '@/lib/rag/answer-composer';
import {
  RAGQuery,
  ExtractedEntities,
  ChatContext,
  ChatResponse
} from '@/lib/types/rag';

describe('WyngAI Central Assistant - Core Questions', () => {
  let queryUnderstanding: QueryUnderstanding;
  let retriever: RAGRetriever;
  let answerComposer: AnswerComposer;

  beforeAll(() => {
    queryUnderstanding = new QueryUnderstanding();
    retriever = new RAGRetriever();
    answerComposer = new AnswerComposer();
  });

  describe('1. Out-of-State Coverage Questions', () => {
    test('PPO out-of-state coverage inquiry', async () => {
      const question = "Does my PPO cover me when I travel out of state?";
      const context: ChatContext = {
        planInputs: { planType: 'PPO', state: 'CA' },
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);

      expect(entities.planType).toBe('PPO');
      expect(entities.intent).toBe('coverage_verification');

      // Mock retrieval result for testing
      const mockRetrievalResult = {
        sections: [
          {
            section: {
              section_id: 'test-1',
              doc_id: 'federal-doc',
              text: 'PPO plans typically provide out-of-state coverage through their national network...',
              tokens: 50,
              created_at: '2023-01-01'
            },
            document: {
              doc_id: 'federal-doc',
              authority: 'federal' as const,
              title: 'Health Plan Coverage Standards',
              doc_type: 'regulation' as const,
              url: 'https://example.com/regulation',
              url_hash: 'abc123',
              sha256: 'def456',
              retrieved_at: '2023-01-01'
            },
            score: 0.9,
            match_type: 'semantic' as const
          }
        ],
        authorities_used: ['federal'],
        total_results: 1
      };

      const ragQuery: RAGQuery = {
        text: question,
        entities,
        context
      };

      // Since we can't test actual retrieval without a database,
      // we'll test the answer composition with mock data
      const response = await answerComposer.composeAnswer(
        question,
        entities,
        mockRetrievalResult,
        context
      );

      // Assertions
      expect(response.citations).toHaveLength(1);
      expect(response.citations[0].authority).toBe('federal');
      expect(response.nextSteps).toBeDefined();
      expect(response.nextSteps.length).toBeGreaterThan(0);
      expect(response.confidence).toBeGreaterThan(0.6);
      expect(response.authorities_used).toContain('federal');
    }, 15000);

    test('HMO out-of-state emergency coverage', async () => {
      const question = "I have an HMO. Am I covered for emergency care while traveling?";
      const context: ChatContext = {
        planInputs: { planType: 'HMO', state: 'NY' },
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);

      expect(entities.planType).toBe('HMO');
      expect(entities.intent).toBe('coverage_verification');
      expect(entities.keywords).toContain('emergency');
    });
  });

  describe('2. External Review Process', () => {
    test('External review process inquiry', async () => {
      const question = "How do I file an external review in California?";
      const context: ChatContext = {
        planInputs: { state: 'CA' },
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);

      expect(entities.state).toBe('CA');
      expect(entities.intent).toBe('appeal_process');
      expect(entities.keywords).toContain('external review');
    });
  });

  describe('3. Prior Authorization vs Referral', () => {
    test('Prior auth vs referral clarification', async () => {
      const question = "What's the difference between prior authorization and a referral?";
      const context: ChatContext = {
        planInputs: {},
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);

      expect(entities.intent).toBe('prior_auth');
      expect(entities.keywords).toContain('prior authorization');
      expect(entities.keywords).toContain('referral');
    });
  });

  describe('4. EOB vs Bill Discrepancy', () => {
    test('EOB shows $0 but received bill', async () => {
      const question = "My EOB shows $0 patient responsibility but I got a bill for $500. What's wrong?";
      const context: ChatContext = {
        planInputs: {},
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);

      expect(entities.intent).toBe('billing_question');
      expect(entities.keywords).toContain('eob');
    });
  });

  describe('5. NSA Surprise Billing', () => {
    test('NSA ancillary surprise billing scenario', async () => {
      const question = "I got a surprise bill from an anesthesiologist at an in-network hospital. Am I protected?";
      const context: ChatContext = {
        planInputs: {},
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);

      expect(entities.intent).toBe('billing_question');
      expect(entities.keywords).toContain('surprise billing');
      expect(entities.urgency).toBe('high');
    });
  });

  describe('6. Deductible and OOP Math', () => {
    test('Deductible and out-of-pocket calculation', async () => {
      const question = "I have a $2000 deductible and have paid $800 so far. How much will I pay for a $1500 procedure?";
      const context: ChatContext = {
        planInputs: {
          deductible: { individual: 200000 }, // $2000 in cents
          coinsurance: 20
        },
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);

      expect(entities.intent).toBe('cost_estimation');
      expect(entities.keywords).toContain('deductible');
    });
  });

  describe('7. Fertility Benefits Coverage', () => {
    test('Fertility benefits inquiry', async () => {
      const question = "Are fertility treatments covered under my plan?";
      const context: ChatContext = {
        planInputs: {},
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);

      expect(entities.intent).toBe('coverage_verification');
      expect(entities.keywords).toContain('fertility');
    });
  });

  describe('8. Formulary Exception Process', () => {
    test('Formulary exception request', async () => {
      const question = "My medication isn't on the formulary. How do I get an exception?";
      const context: ChatContext = {
        planInputs: {},
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);

      expect(entities.intent).toBe('pharmacy');
      expect(entities.keywords).toContain('formulary');
    });
  });

  describe('9. COBRA vs Marketplace', () => {
    test('COBRA vs Marketplace after job loss', async () => {
      const question = "I lost my job. Should I choose COBRA or get insurance from the marketplace?";
      const context: ChatContext = {
        planInputs: {},
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);

      expect(entities.intent).toBe('enrollment');
      expect(entities.keywords).toContain('cobra');
      expect(entities.keywords).toContain('marketplace');
    });
  });

  describe('10. Itemized Bill and Appeal Letter', () => {
    test('Request for itemized bill and appeal artifacts', async () => {
      const question = "How do I get an itemized bill and write an appeal letter?";
      const context: ChatContext = {
        planInputs: {},
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);

      expect(entities.intent).toBe('appeal_process');
      expect(entities.keywords).toContain('appeal');
    });
  });

  describe('Integration Tests', () => {
    test('Multi-turn conversation context preservation', async () => {
      // Simulate a multi-turn conversation
      let context: ChatContext = {
        planInputs: {},
        collectedFacts: {},
        clarificationHistory: []
      };

      // First turn: User mentions plan type
      const firstQuestion = "I have a PPO plan and want to know about coverage";
      const firstEntities = await queryUnderstanding.extractEntities(firstQuestion, context);
      context = queryUnderstanding.updateContext(context, firstEntities);

      expect(context.planInputs?.planType).toBe('PPO');

      // Second turn: User asks specific question without mentioning plan
      const secondQuestion = "Do I need a referral to see a specialist?";
      const secondEntities = await queryUnderstanding.extractEntities(secondQuestion, context);

      expect(secondEntities.planType).toBe('PPO'); // Should inherit from context
      expect(secondEntities.intent).toBe('prior_auth');
    });

    test('Clarification flow when missing critical information', async () => {
      const question = "What will my costs be for this procedure?";
      const context: ChatContext = {
        planInputs: {},
        collectedFacts: {},
        clarificationHistory: []
      };

      const entities = await queryUnderstanding.extractEntities(question, context);
      const clarification = queryUnderstanding.shouldClarify(entities, context);

      expect(clarification.needsClarification).toBe(true);
      expect(clarification.missingInfo).toBeDefined();
      expect(clarification.clarificationQuestion).toBeDefined();
    });
  });

  describe('Response Quality Assertions', () => {
    test('All responses should meet quality standards', async () => {
      const testCases = [
        "Does my insurance cover mental health?",
        "How do I appeal a denied claim?",
        "What are these CARC codes on my EOB?",
        "I got a surprise bill from an out-of-network provider"
      ];

      for (const question of testCases) {
        const entities = await queryUnderstanding.extractEntities(question);

        // Every question should have an intent
        expect(entities.intent).toBeDefined();
        expect(entities.intent).not.toBe('');

        // Every question should have extracted keywords
        expect(entities.keywords).toBeDefined();
        expect(entities.keywords!.length).toBeGreaterThan(0);

        // Urgency should be assessed
        expect(entities.urgency).toBeOneOf(['low', 'medium', 'high']);
      }
    });
  });
});

// Helper matchers
expect.extend({
  toBeOneOf(received, validOptions) {
    const pass = validOptions.includes(received);
    return {
      message: () => `expected ${received} to be one of ${validOptions.join(', ')}`,
      pass
    };
  }
});

// Mock database functions for testing
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ data: null, error: null }))
        }))
      }))
    }))
  }))
}));