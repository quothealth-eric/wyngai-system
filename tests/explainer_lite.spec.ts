import { test, expect } from '@playwright/test'

test.describe('Explainer Lite', () => {
  test('should generate 3 bullets with citations for text input', async ({ page }) => {
    await page.goto('/')

    // Click on Quick Explainer (Lite) button
    await page.click('text=Quick Explainer (Lite)')

    // Wait for the component to appear
    await expect(page.locator('text=Quick Explainer (Lite)')).toBeVisible()

    // Enter test text
    const testText = 'CPT 36415 venipuncture $72'
    await page.fill('[placeholder*="Paste billing text here"]', testText)

    // Submit
    await page.click('text=Get Quick Explanation')

    // Wait for results (up to 15 seconds as per requirement)
    await expect(page.locator('text=Quick Explanation')).toBeVisible({ timeout: 15000 })

    // Check for 3 bullets
    const bullets = page.locator('.border-l-4.border-primary')
    await expect(bullets).toHaveCount(3)

    // Check for citations
    await expect(page.locator('text=Sources')).toBeVisible()
    const citations = page.locator('[role="badge"]')
    await expect(citations).toHaveCount.greaterThanOrEqual(2)

    // Verify bullet titles
    await expect(page.locator('text=What this means')).toBeVisible()
    await expect(page.locator('text=Common issues')).toBeVisible()
    await expect(page.locator('text=Your next step')).toBeVisible()
  })

  test('should handle image upload and OCR', async ({ page }) => {
    await page.goto('/')

    // Click on Quick Explainer (Lite) button
    await page.click('text=Quick Explainer (Lite)')

    // Switch to image mode
    await page.click('text=Image')

    // Upload test image (mock file)
    const fileInput = page.locator('input[type="file"]')

    // Create a simple test image blob
    const testImageContent = Buffer.from('fake-image-content')
    await fileInput.setInputFiles({
      name: 'test-bill.jpg',
      mimeType: 'image/jpeg',
      buffer: testImageContent
    })

    // Submit
    await page.click('text=Get Quick Explanation')

    // Should show extracting text
    await expect(page.locator('text=Extracting & Analyzing...')).toBeVisible()

    // Should complete within timeout or show error for mock data
    await page.waitForTimeout(5000)
  })

  test('should not create a full case', async ({ page }) => {
    await page.goto('/')

    await page.click('text=Quick Explainer (Lite)')
    await page.fill('[placeholder*="Paste billing text here"]', 'CPT 99213 office visit $150')
    await page.click('text=Get Quick Explanation')

    // Wait for completion
    await expect(page.locator('text=Quick Explanation')).toBeVisible({ timeout: 15000 })

    // Should not navigate to a full case/analysis page
    expect(page.url()).toContain('/')
    expect(page.url()).not.toContain('/analyzer')
    expect(page.url()).not.toContain('/case')
  })

  test('should allow explaining another item', async ({ page }) => {
    await page.goto('/')

    await page.click('text=Quick Explainer (Lite)')
    await page.fill('[placeholder*="Paste billing text here"]', 'CPT 36415 venipuncture $72')
    await page.click('text=Get Quick Explanation')

    await expect(page.locator('text=Quick Explanation')).toBeVisible({ timeout: 15000 })

    // Click "Explain Another"
    await page.click('text=Explain Another')

    // Should reset to input form
    await expect(page.locator('[placeholder*="Paste billing text here"]')).toBeVisible()
    await expect(page.locator('text=Get Quick Explanation')).toBeVisible()
  })
})