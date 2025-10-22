import { test, expect } from '@playwright/test'

test.describe('Network Finder', () => {
  test('should return directory links and call script for payer search', async ({ page }) => {
    const response = await page.request.post('/api/network/find', {
      data: {
        payer: 'UnitedHealthcare',
        state: 'FL',
        npi: '1234567890',
        providerName: 'Dr. Smith'
      }
    })

    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.success).toBeTruthy()

    // Should return directory links
    expect(Array.isArray(data.directoryLinks)).toBeTruthy()
    expect(data.directoryLinks.length).toBeGreaterThanOrEqual(1)

    // First link should be for UnitedHealthcare
    const firstLink = data.directoryLinks[0]
    expect(firstLink.label).toContain('United')
    expect(firstLink.url).toBeTruthy()
    expect(firstLink.description).toBeTruthy()

    // Should return call script
    expect(data.callScript).toBeTruthy()
    expect(data.callScript).toContain('Dr. Smith')
    expect(data.callScript).toContain('1234567890')
    expect(data.callScript).toContain('in-network')
  })

  test('should lookup NPI information when provided', async ({ page }) => {
    // First seed some NPI data
    await page.request.post('/api/admin/setup-chat-schema')

    const response = await page.request.post('/api/network/find', {
      data: {
        npi: '1234567890',
        payer: 'Aetna',
        state: 'CA'
      }
    })

    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.success).toBeTruthy()

    // Should have directory links for Aetna
    expect(data.directoryLinks.some((link: any) => link.label.toLowerCase().includes('aetna'))).toBeTruthy()

    // Should include call script with NPI
    expect(data.callScript).toContain('1234567890')
  })

  test('should handle common payer directory patterns', async ({ page }) => {
    const payers = ['Anthem', 'Blue Cross', 'Cigna', 'Humana']

    for (const payer of payers) {
      const response = await page.request.post('/api/network/find', {
        data: {
          payer,
          state: 'TX'
        }
      })

      expect(response.ok()).toBeTruthy()

      const data = await response.json()
      expect(data.success).toBeTruthy()
      expect(data.directoryLinks.length).toBeGreaterThanOrEqual(1)

      // Should have payer-specific directory
      const hasPayerLink = data.directoryLinks.some((link: any) =>
        link.label.toLowerCase().includes(payer.toLowerCase())
      )
      expect(hasPayerLink).toBeTruthy()
    }
  })

  test('should generate appropriate call script', async ({ page }) => {
    const response = await page.request.post('/api/network/find', {
      data: {
        payer: 'Blue Cross Blue Shield',
        providerName: 'Dr. Johnson Cardiology',
        npi: '9876543210',
        state: 'NY'
      }
    })

    const data = await response.json()
    expect(data.success).toBeTruthy()

    const script = data.callScript
    expect(script).toBeTruthy()

    // Should include all key elements
    expect(script).toContain('Dr. Johnson Cardiology')
    expect(script).toContain('9876543210')
    expect(script).toContain('in-network')
    expect(script).toContain('NY')

    // Should ask about key verification points
    expect(script).toContain('referral')
    expect(script).toContain('authorization')
    expect(script).toContain('facility fees')
    expect(script).toContain('copay')
  })
})