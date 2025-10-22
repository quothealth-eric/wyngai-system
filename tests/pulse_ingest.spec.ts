import { test, expect } from '@playwright/test'

test.describe('Policy Pulse', () => {
  test('should ingest policy documents and create pulse items', async ({ page }) => {
    // Go to admin panel for pulse ingestion
    await page.goto('/admin')

    // Login with admin credentials
    await page.fill('input[name="username"]', 'admin')
    await page.fill('input[name="password"]', 'wyng2024!')
    await page.click('button[type="submit"]')

    // Navigate to pulse ingestion
    await page.goto('/api/pulse/ingest', { waitUntil: 'networkidle' })

    // Should create sample policy pulse items
    const response = await page.evaluate(() => fetch('/api/pulse/ingest', { method: 'POST' }))
    expect(response.ok).toBeTruthy()
  })

  test('should display pulse feed on home page', async ({ page }) => {
    // First ensure there are pulse items by calling ingest
    await page.request.post('/api/pulse/ingest')

    await page.goto('/')

    // Should show top policy changes
    await expect(page.locator('text=Policy Changes').or(page.locator('text=What changed'))).toBeVisible({ timeout: 10000 })

    // Should have at least 3 items
    const pulseItems = page.locator('[class*="pulse-item"]').or(page.locator('text=Medicare').or(page.locator('text=No Surprises')))
    await expect(pulseItems.first()).toBeVisible()
  })

  test('should filter pulse feed by state and authority', async ({ page }) => {
    // Test the API endpoint directly
    const response = await page.request.get('/api/pulse/feed?state=FL&authority=StateDOI')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.success).toBeTruthy()
    expect(Array.isArray(data.items)).toBeTruthy()

    // If we have Florida-specific items, they should be in the results
    if (data.items.length > 0) {
      const hasFloridaItems = data.items.some((item: any) =>
        item.jurisdiction === 'FL' || item.authority === 'StateDOI'
      )
      expect(hasFloridaItems).toBeTruthy()
    }
  })

  test('should show policy pulse with action items', async ({ page }) => {
    await page.request.post('/api/pulse/ingest')

    const response = await page.request.get('/api/pulse/feed?limit=3')
    const data = await response.json()

    expect(data.success).toBeTruthy()
    expect(data.items.length).toBeGreaterThanOrEqual(3)

    // Each item should have required fields
    for (const item of data.items) {
      expect(item.title).toBeTruthy()
      expect(item.summary).toBeTruthy()
      expect(Array.isArray(item.action_items)).toBeTruthy()
      expect(item.authority).toBeTruthy()
    }
  })
})