import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin/auth'

// E2E Test cases for Wyng Chat v2
const testCases = [
  {
    id: 'nsa_oon_ancillary',
    name: 'NSA Out-of-Network Ancillary at In-Network Facility',
    question: 'I had surgery at an in-network hospital in California, but the anesthesiologist was out-of-network and I received a surprise bill for $3,000. My insurance is Blue Cross PPO.',
    expected: {
      theme: 'surprise_billing',
      citations_should_include: ['45 CFR 149'],
      phone_scripts_count: 1,
      checklist_min_items: 4,
      summary_bullets: 3
    }
  },
  {
    id: 'preventive_diagnostic_flip',
    name: 'Preventive vs Diagnostic Coding Flip',
    question: 'My annual colonoscopy screening was coded as diagnostic instead of preventive, so I was charged a $500 copay instead of it being free under ACA preventive benefits.',
    expected: {
      theme: 'preventive_vs_diagnostic',
      citations_should_include: ['45 CFR 147.130'],
      appeal_recommended: true,
      checklist_should_include: ['request recode']
    }
  },
  {
    id: 'mue_exceeded_jcode',
    name: 'MUE Exceeded J-Code',
    question: 'My rheumatologist administered 4 units of Humira (J0135) but Medicare only allowed 2 units, saying I exceeded the MUE limit. The rest was denied.',
    expected: {
      theme: 'mue_exceeded',
      citations_should_include: ['CMS MUE'],
      entities_should_include: { payer: 'medicare' }
    }
  },
  {
    id: 'cobra_vs_marketplace',
    name: 'COBRA vs Marketplace After Job Loss',
    question: 'I lost my job last month and need to decide between COBRA continuation and getting a plan from the healthcare marketplace. What are the timing rules and which is better?',
    expected: {
      theme: 'cobra_continuation',
      citations_should_include: ['26 USC 4980B', 'COBRA'],
      checklist_should_include_timeline: true
    }
  }
]

async function runTestCase(testCase: any): Promise<any> {
  try {
    console.log(`🧪 Running test: ${testCase.name}`)

    const response = await fetch('/api/chat/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test+${testCase.id}@wyng.co`,
        question: testCase.question,
        state_hint: 'CA',
        payer_hint: testCase.expected.entities_should_include?.payer || undefined
      })
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        testCase: testCase.id,
        success: false,
        error: data.error,
        details: 'API request failed'
      }
    }

    // Validate response structure
    const results = {
      testCase: testCase.id,
      success: true,
      validations: {} as any,
      response_summary: {
        theme: data.theme,
        citations_count: data.citations.length,
        phone_scripts_count: data.phone_scripts.length,
        checklist_items: data.checklist.length,
        summary_bullets: data.summary.length
      }
    }

    // Theme validation
    if (testCase.expected.theme) {
      results.validations.theme_match = data.theme === testCase.expected.theme
      if (!results.validations.theme_match) {
        results.success = false
        results.validations.theme_expected = testCase.expected.theme
        results.validations.theme_actual = data.theme
      }
    }

    // Citations validation
    if (testCase.expected.citations_should_include) {
      results.validations.citations_found = []
      for (const expectedCitation of testCase.expected.citations_should_include) {
        const found = data.citations.some((c: any) => c.source.includes(expectedCitation))
        results.validations.citations_found.push({
          citation: expectedCitation,
          found: found
        })
        if (!found) {
          results.success = false
        }
      }
    }

    // Phone scripts validation
    if (testCase.expected.phone_scripts_count) {
      results.validations.phone_scripts_count_ok = data.phone_scripts.length >= testCase.expected.phone_scripts_count
      if (!results.validations.phone_scripts_count_ok) {
        results.success = false
      }
    }

    // Checklist validation
    if (testCase.expected.checklist_min_items) {
      results.validations.checklist_min_items_ok = data.checklist.length >= testCase.expected.checklist_min_items
      if (!results.validations.checklist_min_items_ok) {
        results.success = false
      }
    }

    // Appeal recommendation
    if (testCase.expected.appeal_recommended !== undefined) {
      results.validations.appeal_recommended_match = data.appeal.recommended === testCase.expected.appeal_recommended
      if (!results.validations.appeal_recommended_match) {
        results.success = false
      }
    }

    // Summary bullets
    if (testCase.expected.summary_bullets) {
      results.validations.summary_bullets_ok = data.summary.length === testCase.expected.summary_bullets
      if (!results.validations.summary_bullets_ok) {
        results.success = false
      }
    }

    // Response completeness
    results.validations.response_complete = {
      has_explanation: !!data.plain_english_explanation && data.plain_english_explanation.length >= 100,
      has_citations: data.citations.length > 0,
      has_scripts: data.phone_scripts.length > 0,
      has_checklist: data.checklist.length > 0,
      has_summary: data.summary.length > 0,
      has_disclaimer: !!data.disclaimer
    }

    const allComplete = Object.values(results.validations.response_complete).every(Boolean)
    if (!allComplete) {
      results.success = false
    }

    return results

  } catch (error) {
    return {
      testCase: testCase.id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Test execution failed'
    }
  }
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🚀 Running Wyng Chat v2 E2E Tests...')

    const results = []
    let totalTests = testCases.length
    let passedTests = 0

    // Run all test cases
    for (const testCase of testCases) {
      const result = await runTestCase(testCase)
      results.push(result)

      if (result.success) {
        passedTests++
        console.log(`✅ ${testCase.id}: PASSED`)
      } else {
        console.log(`❌ ${testCase.id}: FAILED`)
        if (result.error) {
          console.log(`   Error: ${result.error}`)
        }
        if (result.validations) {
          Object.entries(result.validations).forEach(([key, value]) => {
            if (typeof value === 'boolean' && !value) {
              console.log(`   Validation failed: ${key}`)
            } else if (typeof value === 'object' && value !== null) {
              console.log(`   Validation details: ${key} =`, value)
            }
          })
        }
      }
    }

    // Performance test (latency)
    console.log('🚀 Running performance test...')
    const perfStart = Date.now()
    await runTestCase(testCases[0]) // Use first test case
    const perfEnd = Date.now()
    const latency = perfEnd - perfStart

    const summary = {
      total_tests: totalTests,
      passed_tests: passedTests,
      failed_tests: totalTests - passedTests,
      success_rate: `${((passedTests / totalTests) * 100).toFixed(1)}%`,
      performance: {
        latency_ms: latency,
        latency_ok: latency <= 8000, // ≤8s requirement
        p95_estimate: `${latency}ms (single sample)`
      }
    }

    console.log(`📊 Test Summary:`)
    console.log(`   Passed: ${passedTests}/${totalTests} (${summary.success_rate})`)
    console.log(`   Latency: ${latency}ms`)

    return NextResponse.json({
      success: passedTests === totalTests,
      summary,
      detailed_results: results,
      test_cases: testCases.map(tc => ({
        id: tc.id,
        name: tc.name,
        question: tc.question.substring(0, 100) + '...'
      }))
    })

  } catch (error) {
    console.error('❌ Test suite error:', error)
    return NextResponse.json(
      { error: 'Test suite failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Individual test runner
export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const testId = searchParams.get('test')

  if (!testId) {
    return NextResponse.json({
      available_tests: testCases.map(tc => ({
        id: tc.id,
        name: tc.name,
        description: tc.question.substring(0, 100) + '...'
      }))
    })
  }

  const testCase = testCases.find(tc => tc.id === testId)
  if (!testCase) {
    return NextResponse.json(
      { error: `Test case '${testId}' not found` },
      { status: 404 }
    )
  }

  try {
    const result = await runTestCase(testCase)
    return NextResponse.json({
      test_case: testCase,
      result: result,
      success: result.success
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Test failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}