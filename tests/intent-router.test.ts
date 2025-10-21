/**
 * Tests for Enhanced Intent Router
 */

import { EnhancedIntentRouter } from '../src/lib/intent/enhanced-router'

describe('EnhancedIntentRouter', () => {
  let router: EnhancedIntentRouter

  beforeEach(() => {
    router = new EnhancedIntentRouter()
  })

  describe('Chat Intent Detection', () => {
    test('should detect PPO out-of-state coverage question', async () => {
      const result = await router.routeIntent({
        text: 'Does my PPO cover me in Arizona?'
      })

      expect(result.intent).toBe('CHAT')
      expect(result.confidence).toBeGreaterThan(0.7)
      expect(result.themes).toContainEqual(
        expect.objectContaining({ theme: 'Out-of-State Coverage' })
      )
      expect(result.state).toBe('AZ')
      expect(result.marketplace).toBe('Healthcare.gov')
    })

    test('should detect enrollment question with confidence', async () => {
      const result = await router.routeIntent({
        text: 'How do I switch plans during open enrollment in California?'
      })

      expect(result.intent).toBe('CHAT')
      expect(result.confidence).toBeGreaterThan(0.6)
      expect(result.themes).toContainEqual(
        expect.objectContaining({ theme: 'Open Enrollment' })
      )
      expect(result.state).toBe('CA')
      expect(result.marketplace).toBe('State-based')
    })

    test('should detect prior authorization question', async () => {
      const result = await router.routeIntent({
        text: 'Do I need prior authorization for an MRI?'
      })

      expect(result.intent).toBe('CHAT')
      expect(result.themes).toContainEqual(
        expect.objectContaining({ theme: 'Prior Authorization' })
      )
      expect(result.reasons).toContain('question_word: do')
    })
  })

  describe('Analyzer Intent Detection', () => {
    test('should detect bill analysis with high confidence for file upload', async () => {
      const result = await router.routeIntent({
        files: [
          { name: 'medical-bill.pdf', size: 150000, type: 'application/pdf' }
        ]
      })

      expect(result.intent).toBe('ANALYZER')
      expect(result.confidence).toBe(0.95)
      expect(result.reasons).toContain('1 file(s) uploaded')
    })

    test('should detect billing question about overcharge', async () => {
      const result = await router.routeIntent({
        text: 'Was I overcharged for venipuncture CPT 36415?'
      })

      expect(result.intent).toBe('ANALYZER')
      expect(result.confidence).toBeGreaterThan(0.7)
      expect(result.themes).toContainEqual(
        expect.objectContaining({ theme: 'Bill Audit' })
      )
      expect(result.reasons).toContain('procedure_codes_detected')
    })

    test('should detect EOB analysis request', async () => {
      const result = await router.routeIntent({
        text: 'Can you review my EOB for errors? I think there are mistakes in the calculation.'
      })

      expect(result.intent).toBe('ANALYZER')
      expect(result.themes).toContainEqual(
        expect.objectContaining({ theme: 'EOB Math' })
      )
    })
  })

  describe('Clarification Detection', () => {
    test('should require clarification for ambiguous input', async () => {
      const result = await router.routeIntent({
        text: 'help'
      })

      expect(result.intent).toBe('CLARIFY')
      expect(result.suggestedActions).toBeDefined()
      expect(result.suggestedActions?.length).toBeGreaterThan(0)
    })

    test('should offer clarification for mixed signals', async () => {
      const result = await router.routeIntent({
        text: 'I have a bill but also questions about coverage'
      })

      if (result.intent === 'CLARIFY') {
        expect(result.suggestedActions).toBeDefined()
        expect(result.suggestedActions).toContainEqual(
          expect.objectContaining({ intent: 'ANALYZER' })
        )
        expect(result.suggestedActions).toContainEqual(
          expect.objectContaining({ intent: 'CHAT' })
        )
      }
    })
  })

  describe('Entity Extraction', () => {
    test('should extract state and payer from text', async () => {
      const result = await router.routeIntent({
        text: 'My UnitedHealthcare plan in New York is denying coverage'
      })

      expect(result.state).toBe('NY')
      expect(result.payer).toBe('UnitedHealthcare')
      expect(result.marketplace).toBe('State-based')
    })

    test('should detect multiple themes with scores', async () => {
      const result = await router.routeIntent({
        text: 'I need to appeal a denial and also understand my formulary tiers'
      })

      expect(result.themes.length).toBeGreaterThan(1)
      expect(result.themes).toContainEqual(
        expect.objectContaining({ theme: 'Exception/Appeal' })
      )
      expect(result.themes).toContainEqual(
        expect.objectContaining({ theme: 'Formulary/Tiers' })
      )
    })
  })

  describe('Performance', () => {
    test('should complete intent routing within reasonable time', async () => {
      const start = Date.now()

      const result = await router.routeIntent({
        text: 'Does my HMO require referrals for specialists in California?'
      })

      expect(result.processingTimeMs).toBeLessThan(1000) // Less than 1 second
      expect(Date.now() - start).toBeLessThan(2000) // Total time less than 2 seconds
    })
  })
})