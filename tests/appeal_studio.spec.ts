import { test, expect } from '@playwright/test'

test.describe('Appeal Letter Studio 2.0', () => {
  test('should generate letter, script, and checklist with proper word counts', async ({ page }) => {
    // Create form data for appeal generation
    const formData = new FormData()
    formData.append('threadId', 'test-thread-123')
    formData.append('payer', 'Blue Cross Blue Shield')
    formData.append('claimId', 'BC123456789')
    formData.append('dos', '2024-10-15')
    formData.append('codes', 'CPT 36415')
    formData.append('denial', 'Packaged venipuncture - should not be separately billable')
    formData.append('selectedRules', JSON.stringify(['Packaged Services', 'Duplicate Billing']))

    const response = await page.request.post('/api/appeals/build', {
      multipart: formData
    })

    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.success).toBeTruthy()

    // Check letter
    expect(data.letter).toBeTruthy()
    expect(data.wordCounts.letter).toBeGreaterThanOrEqual(180)
    expect(data.wordCounts.letter).toBeLessThanOrEqual(250)

    // Check script
    expect(data.script).toBeTruthy()
    expect(data.wordCounts.script).toBeGreaterThanOrEqual(110)
    expect(data.wordCounts.script).toBeLessThanOrEqual(150)

    // Check checklist
    expect(Array.isArray(data.checklist)).toBeTruthy()
    expect(data.checklist.length).toBeGreaterThanOrEqual(5)
    expect(data.checklist.length).toBeLessThanOrEqual(8)

    // Check citations
    expect(Array.isArray(data.citations)).toBeTruthy()
    expect(data.citations.length).toBeGreaterThanOrEqual(1)

    // Verify content includes claim details
    expect(data.letter).toContain('Blue Cross')
    expect(data.letter).toContain('BC123456789')
    expect(data.letter).toContain('36415')
  })

  test('should process uploaded EOB files with OCR', async ({ page }) => {
    const formData = new FormData()
    formData.append('threadId', 'test-thread-456')
    formData.append('payer', 'Aetna')
    formData.append('denial', 'Service not covered under current plan')

    // Add mock file
    const mockEobContent = Buffer.from('EXPLANATION OF BENEFITS\nPatient: John Doe\nClaim #: AT789012\nCPT 99213: $150.00\nDenied: Not medically necessary')
    const file = new File([mockEobContent], 'eob.pdf', { type: 'application/pdf' })
    formData.append('files', file)

    const response = await page.request.post('/api/appeals/build', {
      multipart: formData
    })

    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.success).toBeTruthy()

    // Should have extracted data from files
    expect(Array.isArray(data.extractedData)).toBeTruthy()
    if (data.extractedData.length > 0) {
      expect(data.extractedData[0].filename).toBe('eob.pdf')
      expect(data.extractedData[0].textLength).toBeGreaterThan(0)
    }

    // Letter should reference extracted information
    expect(data.letter).toBeTruthy()
    expect(data.script).toBeTruthy()
    expect(data.checklist).toBeTruthy()
  })

  test('should handle different rule violations', async ({ page }) => {
    const ruleTypes = [
      'Packaged Services',
      'Duplicate Billing',
      'Incorrect Coding',
      'Out of Network',
      'Prior Authorization'
    ]

    for (const rule of ruleTypes) {
      const formData = new FormData()
      formData.append('threadId', `test-thread-${rule.replace(/\s+/g, '-').toLowerCase()}`)
      formData.append('payer', 'UnitedHealthcare')
      formData.append('denial', `Claim denied due to ${rule.toLowerCase()}`)
      formData.append('selectedRules', JSON.stringify([rule]))

      const response = await page.request.post('/api/appeals/build', {
        multipart: formData
      })

      expect(response.ok()).toBeTruthy()

      const data = await response.json()
      expect(data.success).toBeTruthy()

      // Letter should reference the specific rule violation
      expect(data.letter.toLowerCase()).toContain(rule.toLowerCase().split(' ')[0])

      // Should have proper structure
      expect(data.wordCounts.letter).toBeGreaterThan(150)
      expect(data.wordCounts.script).toBeGreaterThan(100)
      expect(data.checklist.length).toBeGreaterThan(3)
    }
  })

  test('should provide actionable checklist items', async ({ page }) => {
    const formData = new FormData()
    formData.append('threadId', 'test-thread-checklist')
    formData.append('payer', 'Cigna')
    formData.append('denial', 'Claim requires prior authorization')

    const response = await page.request.post('/api/appeals/build', {
      multipart: formData
    })

    const data = await response.json()
    expect(data.success).toBeTruthy()

    // Checklist should have actionable items
    const checklistText = data.checklist.join(' ').toLowerCase()
    expect(checklistText).toContain('gather')
    expect(checklistText).toContain('submit')
    expect(checklistText).toContain('follow')

    // Should mention key appeal process steps
    expect(checklistText).toContain('eob')
    expect(checklistText).toContain('timeframe')
    expect(checklistText).toContain('reference')
  })
})