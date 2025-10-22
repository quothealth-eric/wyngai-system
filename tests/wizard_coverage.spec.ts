import { test, expect } from '@playwright/test'

test.describe('Coverage Decision Wizard', () => {
  test('should provide immediate answer when critical slots present', async ({ page }) => {
    await page.goto('/')

    // Enter a query with clear state and employer coverage info
    const query = 'I have employer insurance in Florida and my family needs coverage. Should we switch to marketplace?'
    await page.fill('[placeholder*="Ask about insurance"]', query)
    await page.press('[placeholder*="Ask about insurance"]', 'Enter')

    // Wait for response
    await expect(page.locator('text=Coverage Decision')).toBeVisible({ timeout: 15000 })

    // Should show immediate decision without clarifier
    await expect(page.locator('text=Stay with employer')).toBeVisible()
    await expect(page.locator('text=Healthcare.gov')).toBeVisible()

    // Should include scripts
    await expect(page.locator('text=HR')).toBeVisible()
    await expect(page.locator('text=marketplace')).toBeVisible()

    // Should have links section
    await expect(page.locator('text=Healthcare.gov')).toBeVisible()

    // Check for family consideration
    await expect(page.locator('text=family')).toBeVisible()
  })

  test('should detect state-based marketplace', async ({ page }) => {
    await page.goto('/')

    // Test with California (state-based marketplace)
    const query = 'I live in California and want to switch from employer to marketplace coverage'
    await page.fill('[placeholder*="Ask about insurance"]', query)
    await page.press('[placeholder*="Ask about insurance"]', 'Enter')

    await expect(page.locator('text=Coverage Decision')).toBeVisible({ timeout: 15000 })

    // Should detect state-based marketplace (not Healthcare.gov)
    await expect(page.locator('text=Covered California').or(page.locator('text=state exchange'))).toBeVisible()
  })

  test('should handle qualifying events', async ({ page }) => {
    await page.goto('/')

    const query = 'I lost my job and employer insurance in Texas. What are my options now?'
    await page.fill('[placeholder*="Ask about insurance"]', query)
    await page.press('[placeholder*="Ask about insurance"]', 'Enter')

    await expect(page.locator('text=Coverage Decision')).toBeVisible({ timeout: 15000 })

    // Should mention special enrollment period
    await expect(page.locator('text=60 days').or(page.locator('text=Special enrollment'))).toBeVisible()

    // Should reference Healthcare.gov for Texas
    await expect(page.locator('text=Healthcare.gov')).toBeVisible()
  })

  test('should provide OE vs SEP timing', async ({ page }) => {
    await page.goto('/')

    const query = 'Can I switch from my employer plan to marketplace in Florida?'
    await page.fill('[placeholder*="Ask about insurance"]', query)
    await page.press('[placeholder*="Ask about insurance"]', 'Enter')

    await expect(page.locator('text=Coverage Decision')).toBeVisible({ timeout: 15000 })

    // Should mention open enrollment timing
    await expect(page.locator('text=Open enrollment').or(page.locator('text=Nov').or(page.locator('text=Dec')))).toBeVisible()

    // Should provide specific timing guidance
    await expect(page.locator('text=2024').or(page.locator('text=2025'))).toBeVisible()
  })

  test('should include HR and marketplace scripts', async ({ page }) => {
    await page.goto('/')

    const query = 'Should I keep my employer insurance or switch to marketplace in Florida?'
    await page.fill('[placeholder*="Ask about insurance"]', query)
    await page.press('[placeholder*="Ask about insurance"]', 'Enter')

    await expect(page.locator('text=Coverage Decision')).toBeVisible({ timeout: 15000 })

    // Check for HR script
    await expect(page.locator('text=HR').or(page.locator('text=human resources'))).toBeVisible()

    // Check for marketplace script
    await expect(page.locator('text=marketplace').and(page.locator('text=compare'))).toBeVisible()

    // Scripts should be appropriate length (110-150 words approximately)
    const scriptElements = page.locator('[class*="script"]').or(page.locator('text=Hi HR').or(page.locator('text=I\'m looking')))
    if (await scriptElements.count() > 0) {
      const scriptText = await scriptElements.first().textContent()
      const wordCount = scriptText?.split(/\s+/).length || 0
      expect(wordCount).toBeGreaterThan(100)
      expect(wordCount).toBeLessThan(200)
    }
  })
})