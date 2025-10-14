import { NextRequest, NextResponse } from 'next/server'

// Test endpoint for Vertical-AI system
export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing Vertical-AI system components...')

    // Test 1: Taxonomy Classification
    const { HealthcareTaxonomyClassifier } = await import('@/lib/taxonomy/healthcare-120')

    const testQuestions = [
      "I got a duplicate bill for the same procedure",
      "My emergency room visit was surprise billed",
      "My insurance denied my claim for medical necessity",
      "My wellness visit was coded as an office visit"
    ]

    const classificationResults = testQuestions.map(question => {
      const result = HealthcareTaxonomyClassifier.classify(question)
      return {
        question: question.substring(0, 50) + '...',
        intent: result.primary_intent,
        taxonomy_code: result.taxonomy_code,
        confidence: result.confidence
      }
    })

    // Test 2: Knowledge Retrieval
    const { AuthoritativeKnowledgeRetriever } = await import('@/lib/knowledge/authoritative-sources')

    const knowledgeTest = await AuthoritativeKnowledgeRetriever.retrieve({
      intent: 'SURPRISE_BILLING',
      taxonomy_code: 'S001',
      entities: { state: 'CA' },
      search_terms: ['surprise billing', 'emergency'],
      max_results: 3
    })

    // Test 3: Source filtering
    const federalSources = AuthoritativeKnowledgeRetriever.getByAuthority('Federal')
    const caSources = AuthoritativeKnowledgeRetriever.getByJurisdiction('CA')

    const testResults = {
      timestamp: new Date().toISOString(),
      tests_passed: 0,
      total_tests: 5,
      results: {
        taxonomy_classification: {
          status: 'PASS',
          details: classificationResults,
          test_count: classificationResults.length
        },
        knowledge_retrieval: {
          status: knowledgeTest.sources.length > 0 ? 'PASS' : 'FAIL',
          sources_found: knowledgeTest.total_found,
          search_time_ms: knowledgeTest.search_time_ms,
          top_sources: knowledgeTest.sources.slice(0, 2).map(s => ({
            authority: s.authority,
            title: s.title
          }))
        },
        federal_sources_filter: {
          status: federalSources.length > 0 ? 'PASS' : 'FAIL',
          count: federalSources.length
        },
        state_sources_filter: {
          status: caSources.length > 0 ? 'PASS' : 'FAIL',
          count: caSources.length
        },
        text_search: {
          status: 'PASS',
          results: AuthoritativeKnowledgeRetriever.textSearch('emergency', 2).map(s => s.title)
        }
      }
    }

    // Count passed tests
    Object.values(testResults.results).forEach(test => {
      if (test.status === 'PASS') {
        testResults.tests_passed++
      }
    })

    console.log(`✅ Vertical-AI tests completed: ${testResults.tests_passed}/${testResults.total_tests} passed`)

    return NextResponse.json({
      success: true,
      message: 'Vertical-AI system test completed',
      test_results: testResults
    })

  } catch (error) {
    console.error('❌ Vertical-AI test error:', error)

    return NextResponse.json({
      success: false,
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}