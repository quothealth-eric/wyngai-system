import { IntentRouter } from '../lib/intent/router'

describe('IntentRouter', () => {
  let router: IntentRouter

  beforeEach(() => {
    router = new IntentRouter()
  })

  describe('File-based classification', () => {
    it('should classify file uploads as ANALYZER mode', () => {
      const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const result = router.classify({
        text: 'Analyze this document',
        files: [mockFile]
      })

      expect(result.mode).toBe('ANALYZER')
      expect(result.confidence).toBeGreaterThan(0.9)
      expect(result.reason).toContain('Document files detected')
    })

    it('should handle multiple files', () => {
      const files = [
        new File(['test1'], 'bill1.pdf', { type: 'application/pdf' }),
        new File(['test2'], 'eob2.png', { type: 'image/png' })
      ]

      const result = router.classify({
        text: 'Check these medical bills',
        files
      })

      expect(result.mode).toBe('ANALYZER')
      expect(result.confidence).toBeGreaterThan(0.9)
    })
  })

  describe('Text-based classification', () => {
    it('should classify bill analysis keywords as ANALYZER mode', () => {
      const analyzerTexts = [
        'analyze my medical bill',
        'check this EOB for errors',
        'review my explanation of benefits',
        'help me understand my billing statement',
        'is there a billing error in my invoice?'
      ]

      analyzerTexts.forEach(text => {
        const result = router.classify({ text })
        expect(result.mode).toBe('ANALYZER')
        expect(result.confidence).toBeGreaterThan(0.6)
      })
    })

    it('should classify general insurance questions as CHAT mode', () => {
      const chatTexts = [
        'what is a deductible?',
        'how does my insurance coverage work?',
        'what is a copay vs coinsurance?',
        'explain my benefits to me',
        'how do I file an appeal?'
      ]

      chatTexts.forEach(text => {
        const result = router.classify({ text })
        expect(result.mode).toBe('CHAT')
        expect(result.confidence).toBeGreaterThan(0.6)
      })
    })

    it('should handle mixed keywords with higher confidence for stronger matches', () => {
      const result1 = router.classify({
        text: 'analyze my bill and explain my coverage'
      })

      const result2 = router.classify({
        text: 'what is a deductible and can you check my EOB?'
      })

      // Should prioritize the stronger signal
      expect(result1.mode).toBe('ANALYZER') // 'analyze' and 'bill' are strong analyzer signals
      expect(result2.needsClarification).toBe(true) // Mixed signals should trigger clarification
    })
  })

  describe('Clarification handling', () => {
    it('should request clarification for ambiguous input', () => {
      const result = router.classify({
        text: 'I need help with healthcare costs'
      })

      expect(result.needsClarification).toBe(true)
      expect(result.suggestedModes).toContain('CHAT')
      expect(result.suggestedModes).toContain('ANALYZER')
    })

    it('should request clarification when confidence is low', () => {
      const result = router.classify({
        text: 'help me'
      })

      expect(result.needsClarification).toBe(true)
      expect(result.confidence).toBeLessThan(0.6)
    })

    it('should provide mode suggestions with clarification', () => {
      const result = router.classify({
        text: 'insurance question'
      })

      if (result.needsClarification) {
        expect(result.suggestedModes).toBeDefined()
        expect(result.suggestedModes!.length).toBeGreaterThan(0)
        expect(result.clarificationPrompt).toBeDefined()
      }
    })
  })

  describe('Edge cases', () => {
    it('should handle empty input', () => {
      const result = router.classify({ text: '' })

      expect(result.needsClarification).toBe(true)
      expect(result.confidence).toBe(0)
    })

    it('should handle special characters and formatting', () => {
      const result = router.classify({
        text: '$$$ BILLING ERROR $$$ - check my EOB!!!'
      })

      expect(result.mode).toBe('ANALYZER')
      expect(result.confidence).toBeGreaterThan(0.7)
    })

    it('should be case insensitive', () => {
      const result1 = router.classify({ text: 'ANALYZE MY BILL' })
      const result2 = router.classify({ text: 'analyze my bill' })
      const result3 = router.classify({ text: 'Analyze My Bill' })

      expect(result1.mode).toBe(result2.mode)
      expect(result2.mode).toBe(result3.mode)
      expect(result1.confidence).toBeCloseTo(result2.confidence, 1)
    })
  })

  describe('Confidence scoring', () => {
    it('should provide higher confidence for exact keyword matches', () => {
      const strongMatch = router.classify({ text: 'analyze my medical bill for billing errors' })
      const weakMatch = router.classify({ text: 'I have a question about costs' })

      expect(strongMatch.confidence).toBeGreaterThan(weakMatch.confidence)
    })

    it('should boost confidence with multiple relevant keywords', () => {
      const singleKeyword = router.classify({ text: 'analyze this' })
      const multipleKeywords = router.classify({ text: 'analyze my medical bill and check for errors' })

      expect(multipleKeywords.confidence).toBeGreaterThan(singleKeyword.confidence)
    })
  })

  describe('Reason explanations', () => {
    it('should provide clear reasons for classification decisions', () => {
      const result1 = router.classify({ text: 'analyze my bill' })
      const result2 = router.classify({ text: 'what is a deductible' })

      expect(result1.reason).toBeDefined()
      expect(result2.reason).toBeDefined()
      expect(result1.reason).toContain('analyzer')
      expect(result2.reason).toContain('chat')
    })

    it('should explain clarification decisions', () => {
      const result = router.classify({ text: 'help me with healthcare' })

      if (result.needsClarification) {
        expect(result.reason).toBeDefined()
        expect(result.reason).toContain('clarification')
      }
    })
  })
})