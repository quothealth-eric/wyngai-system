import { HealthcareTaxonomyClassifier } from '@/lib/taxonomy/healthcare-120'
import { AuthoritativeKnowledgeRetriever } from '@/lib/knowledge/authoritative-sources'

describe('Vertical-AI Healthcare System', () => {
  describe('Healthcare Taxonomy Classifier', () => {
    test('should classify billing error questions correctly', () => {
      const question = "I received a duplicate bill for the same procedure on the same date"
      const result = HealthcareTaxonomyClassifier.classify(question)

      expect(result.primary_intent).toBe('BILLING_ERRORS')
      expect(result.confidence).toBeGreaterThan(70)
      expect(result.taxonomy_code).toMatch(/^B\d{3}$/)
      expect(result.sub_categories).toContain('billing_errors')
    })

    test('should classify surprise billing questions correctly', () => {
      const question = "I got a surprise bill from an out-of-network doctor at an in-network hospital"
      const result = HealthcareTaxonomyClassifier.classify(question)

      expect(result.primary_intent).toBe('SURPRISE_BILLING')
      expect(result.confidence).toBeGreaterThan(80)
      expect(result.taxonomy_code).toMatch(/^S\d{3}$/)
      expect(result.sub_categories.length).toBeGreaterThan(0)
    })

    test('should classify insurance denial questions correctly', () => {
      const question = "My insurance denied my claim saying it wasn't medically necessary"
      const result = HealthcareTaxonomyClassifier.classify(question)

      expect(result.primary_intent).toBe('INSURANCE_DENIALS')
      expect(result.confidence).toBeGreaterThan(70)
      expect(result.taxonomy_code).toMatch(/^I\d{3}$/)
    })

    test('should classify preventive care questions correctly', () => {
      const question = "My annual wellness visit was charged as a regular office visit"
      const result = HealthcareTaxonomyClassifier.classify(question)

      expect(result.primary_intent).toBe('PREVENTIVE_CARE')
      expect(result.confidence).toBeGreaterThan(70)
      expect(result.taxonomy_code).toMatch(/^P\d{3}$/)
    })

    test('should return all matches for analysis', () => {
      const question = "emergency room surprise billing out of network"
      const result = HealthcareTaxonomyClassifier.classify(question)

      expect(result.all_matches).toBeDefined()
      expect(result.all_matches.length).toBeGreaterThan(0)
      expect(result.all_matches[0]).toHaveProperty('code')
      expect(result.all_matches[0]).toHaveProperty('score')
      expect(result.all_matches[0]).toHaveProperty('title')
    })
  })

  describe('Authoritative Knowledge Retriever', () => {
    test('should retrieve relevant sources for surprise billing', async () => {
      const request = {
        intent: 'SURPRISE_BILLING',
        taxonomy_code: 'S001',
        entities: {
          state: 'CA',
          service_type: 'emergency'
        },
        search_terms: ['surprise billing', 'emergency', 'out-of-network']
      }

      const result = await AuthoritativeKnowledgeRetriever.retrieve(request)

      expect(result.sources.length).toBeGreaterThan(0)
      expect(result.total_found).toBeGreaterThan(0)
      expect(result.search_time_ms).toBeGreaterThan(0)
      expect(result.relevance_scores).toBeDefined()

      // Should prioritize federal regulations
      const hasFedsralSource = result.sources.some(s => s.authority === 'Federal')
      expect(hasFedsralSource).toBe(true)
    })

    test('should filter by jurisdiction correctly', () => {
      const caSources = AuthoritativeKnowledgeRetriever.getByJurisdiction('CA')

      expect(caSources.length).toBeGreaterThan(0)
      // Should include both CA-specific and Federal sources
      expect(caSources.some(s => s.jurisdiction === 'CA')).toBe(true)
      expect(caSources.some(s => s.authority === 'Federal')).toBe(true)
    })

    test('should filter by authority correctly', () => {
      const federalSources = AuthoritativeKnowledgeRetriever.getByAuthority('Federal')
      const cmsSources = AuthoritativeKnowledgeRetriever.getByAuthority('CMS')

      expect(federalSources.length).toBeGreaterThan(0)
      expect(cmsSources.length).toBeGreaterThan(0)

      federalSources.forEach(source => {
        expect(source.authority).toBe('Federal')
      })

      cmsSources.forEach(source => {
        expect(source.authority).toBe('CMS')
      })
    })

    test('should perform text search correctly', () => {
      const results = AuthoritativeKnowledgeRetriever.textSearch('emergency services', 5)

      expect(results.length).toBeGreaterThan(0)
      expect(results.length).toBeLessThanOrEqual(5)

      // Results should contain emergency-related content
      const hasEmergencyContent = results.some(r =>
        r.content.toLowerCase().includes('emergency') ||
        r.title.toLowerCase().includes('emergency')
      )
      expect(hasEmergencyContent).toBe(true)
    })

    test('should handle complex retrieval requests', async () => {
      const request = {
        intent: 'INSURANCE_DENIALS',
        taxonomy_code: 'I002',
        entities: {
          state: 'NY',
          payer: 'aetna',
          plan_type: 'PPO'
        },
        search_terms: ['medical necessity', 'denial', 'appeal'],
        max_results: 3
      }

      const result = await AuthoritativeKnowledgeRetriever.retrieve(request)

      expect(result.sources.length).toBeLessThanOrEqual(3)
      expect(result.sources.length).toBeGreaterThan(0)

      // Should have relevance scores for all returned sources
      result.sources.forEach(source => {
        expect(result.relevance_scores[source.id]).toBeDefined()
        expect(result.relevance_scores[source.id]).toBeGreaterThan(0)
      })
    })
  })

  describe('Integration Tests', () => {
    test('should work together - classification then knowledge retrieval', async () => {
      const question = "My preventive screening was incorrectly coded as diagnostic"

      // Step 1: Classify the intent
      const classification = HealthcareTaxonomyClassifier.classify(question)
      expect(classification.primary_intent).toBe('PREVENTIVE_CARE')

      // Step 2: Retrieve relevant knowledge
      const knowledgeRequest = {
        intent: classification.primary_intent,
        taxonomy_code: classification.taxonomy_code,
        entities: {},
        search_terms: ['preventive', 'screening', 'diagnostic', 'coding']
      }

      const knowledge = await AuthoritativeKnowledgeRetriever.retrieve(knowledgeRequest)

      expect(knowledge.sources.length).toBeGreaterThan(0)

      // Should find ACA preventive services regulations
      const hasPreventiveRegulation = knowledge.sources.some(s =>
        s.content.toLowerCase().includes('preventive') &&
        (s.authority === 'Federal' || s.authority === 'CMS')
      )
      expect(hasPreventiveRegulation).toBe(true)
    })

    test('should handle edge cases gracefully', () => {
      // Empty question
      const emptyResult = HealthcareTaxonomyClassifier.classify('')
      expect(emptyResult.primary_intent).toBe('GENERAL_BILLING')
      expect(emptyResult.confidence).toBeLessThan(50)

      // Non-healthcare question
      const irrelevantResult = HealthcareTaxonomyClassifier.classify('What is the weather like today?')
      expect(irrelevantResult.primary_intent).toBe('GENERAL_BILLING')
      expect(irrelevantResult.confidence).toBeLessThan(50)
    })
  })
})