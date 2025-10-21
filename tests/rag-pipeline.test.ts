/**
 * Tests for Enhanced RAG Pipeline
 */

import { EnhancedRAGRetriever } from '../src/lib/rag/enhanced-retriever'
import { EnhancedAnswerComposer } from '../src/lib/rag/enhanced-answer-composer'
import { RAGQuery, ExtractedEntities, ChatContext } from '../src/lib/types/rag'

// Mock OpenAI for testing
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      embeddings: {
        create: jest.fn().mockResolvedValue({
          data: [{ embedding: new Array(1536).fill(0.1) }]
        })
      },
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'Based on federal regulations and CMS guidance, prior authorization is required for certain medical services. You should contact your insurance company at the number on your ID card to request authorization.'
              }
            }]
          })
        }
      }
    }))
  }
})

// Mock Supabase for testing
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: jest.fn().mockResolvedValue({
      data: [
        {
          section_id: 'test-section-1',
          doc_id: 'test-doc-1',
          text: 'Prior authorization is required for certain medical services as defined in 42 CFR 422.566.',
          similarity: 0.85,
          documents: {
            authority: 'federal',
            title: '42 CFR 422.566 - Prior Authorization',
            doc_type: 'regulation',
            url: 'https://ecfr.gov/test'
          }
        }
      ]
    }),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        textSearch: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        }))
      }))
    }))
  }))
}))

describe('Enhanced RAG Pipeline', () => {
  let retriever: EnhancedRAGRetriever
  let composer: EnhancedAnswerComposer

  beforeEach(() => {
    retriever = new EnhancedRAGRetriever()
    composer = new EnhancedAnswerComposer()
  })

  describe('RAG Retriever', () => {
    test('should retrieve relevant sections for prior authorization query', async () => {
      const query: RAGQuery = {
        text: 'Do I need prior authorization for an MRI?',
        entities: {
          intent: 'prior_authorization',
          planType: 'PPO',
          keywords: ['prior', 'authorization', 'MRI']
        } as ExtractedEntities,
        context: {} as ChatContext,
        chat_id: 'test-chat'
      }

      const result = await retriever.retrieve(query)

      expect(result.sections).toBeDefined()
      expect(result.sections.length).toBeGreaterThan(0)
      expect(result.authorities_used).toContain('federal')
      expect(result.query_embedding).toBeDefined()
      expect(result.query_embedding.length).toBe(1536)
    })

    test('should prioritize federal sources over payer sources', async () => {
      const query: RAGQuery = {
        text: 'What are the rules for emergency coverage?',
        entities: {
          intent: 'emergency_coverage',
          keywords: ['emergency', 'coverage']
        } as ExtractedEntities,
        context: {} as ChatContext
      }

      const result = await retriever.retrieve(query)

      // Check that federal sources appear first in results
      const federalSources = result.sections.filter(s => s.document.authority === 'federal')
      const payerSources = result.sections.filter(s => s.document.authority === 'payer')

      if (federalSources.length > 0 && payerSources.length > 0) {
        expect(federalSources[0].score).toBeGreaterThanOrEqual(payerSources[0].score)
      }
    })

    test('should boost state-specific results when state is provided', async () => {
      const query: RAGQuery = {
        text: 'What are the external review rules in California?',
        entities: {
          state: 'CA',
          intent: 'external_review',
          keywords: ['external', 'review', 'california']
        } as ExtractedEntities,
        context: {} as ChatContext
      }

      const result = await retriever.retrieve(query)

      // Should include state-specific authority
      expect(result.authorities_used).toContain('state_doi')
    })
  })

  describe('Answer Composer', () => {
    test('should generate comprehensive answer with citations', async () => {
      const mockRetrievalResult = {
        sections: [{
          section: {
            section_id: 'test-section-1',
            doc_id: 'test-doc-1',
            text: 'Prior authorization is required for certain medical services including advanced imaging.',
            tokens: 50,
            created_at: '2024-01-01'
          },
          document: {
            doc_id: 'test-doc-1',
            authority: 'federal',
            title: '42 CFR 422.566 - Prior Authorization Requirements',
            doc_type: 'regulation',
            url: 'https://ecfr.gov/test',
            url_hash: 'test-hash',
            sha256: 'test-sha',
            retrieved_at: '2024-01-01'
          },
          score: 0.85,
          match_type: 'semantic' as const
        }],
        authorities_used: ['federal'],
        total_results: 1
      }

      const entities: ExtractedEntities = {
        intent: 'prior_authorization',
        planType: 'PPO',
        keywords: ['prior', 'authorization', 'MRI']
      }

      const context: ChatContext = {
        planInputs: { planType: 'PPO' },
        collectedFacts: {}
      }

      const result = await composer.composeAnswer(
        'Do I need prior authorization for an MRI?',
        entities,
        mockRetrievalResult,
        context
      )

      expect(result.answer).toContain('prior authorization')
      expect(result.citations).toHaveLength(1)
      expect(result.citations[0].authority).toBe('federal')
      expect(result.nextSteps).toBeDefined()
      expect(result.nextSteps.length).toBeGreaterThan(0)
      expect(result.scripts).toBeDefined()
      expect(result.confidence).toBeGreaterThan(0.5)
    })

    test('should include actionable links for state-specific queries', async () => {
      const mockRetrievalResult = {
        sections: [{
          section: {
            section_id: 'test-section-ca',
            doc_id: 'test-doc-ca',
            text: 'California requires external review within 60 days of denial.',
            tokens: 30,
            created_at: '2024-01-01'
          },
          document: {
            doc_id: 'test-doc-ca',
            authority: 'state_doi',
            jurisdiction: 'CA',
            title: 'California External Review Process',
            doc_type: 'regulation',
            url: 'https://insurance.ca.gov/test',
            url_hash: 'test-hash-ca',
            sha256: 'test-sha-ca',
            retrieved_at: '2024-01-01'
          },
          score: 0.80,
          match_type: 'semantic' as const
        }],
        authorities_used: ['state_doi'],
        total_results: 1
      }

      const entities: ExtractedEntities = {
        state: 'CA',
        intent: 'external_review'
      }

      const context: ChatContext = {}

      const result = await composer.composeAnswer(
        'How do I request an external review in California?',
        entities,
        mockRetrievalResult,
        context
      )

      expect(result.actionableLinks).toBeDefined()
      expect(result.actionableLinks?.length).toBeGreaterThan(0)

      const stateLink = result.actionableLinks?.find(link =>
        link.text.includes('California') || link.text.includes('CA')
      )
      expect(stateLink).toBeDefined()
    })

    test('should generate appropriate scripts for different scenarios', async () => {
      const mockRetrievalResult = {
        sections: [],
        authorities_used: [],
        total_results: 0
      }

      const entities: ExtractedEntities = {
        intent: 'prior_authorization'
      }

      const context: ChatContext = {}

      const result = await composer.composeAnswer(
        'How do I get prior authorization?',
        entities,
        mockRetrievalResult,
        context
      )

      expect(result.scripts).toBeDefined()
      expect(result.scripts.length).toBeGreaterThan(0)

      const payerScript = result.scripts.find(script => script.channel === 'payer')
      expect(payerScript).toBeDefined()
      expect(payerScript?.body).toContain('prior authorization')
    })
  })

  describe('Integration', () => {
    test('should handle complete RAG flow for complex query', async () => {
      const query: RAGQuery = {
        text: 'My HMO denied my specialist referral in Texas. What are my appeal options?',
        entities: {
          planType: 'HMO',
          state: 'TX',
          intent: 'appeal',
          keywords: ['denied', 'specialist', 'referral', 'appeal']
        } as ExtractedEntities,
        context: {
          planInputs: { planType: 'HMO', state: 'TX' }
        } as ChatContext
      }

      // Retrieve relevant sections
      const retrievalResult = await retriever.retrieve(query)
      expect(retrievalResult.sections).toBeDefined()

      // Compose answer
      const response = await composer.composeAnswer(
        query.text,
        query.entities,
        retrievalResult,
        query.context
      )

      expect(response.answer).toBeTruthy()
      expect(response.confidence).toBeGreaterThan(0)
      expect(response.nextSteps.length).toBeGreaterThan(0)
      expect(response.authorities_used).toBeDefined()
    })
  })
})