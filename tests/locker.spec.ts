import { test, expect } from '@playwright/test'

test.describe('MyWyng Case Locker', () => {
  test('should create or attach locker and send magic link', async ({ page }) => {
    const response = await page.request.post('/api/locker/create-or-attach', {
      data: {
        email: 'test@example.com',
        threadId: 'test-thread-123'
      }
    })

    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.success).toBeTruthy()
    expect(data.lockerId).toBeTruthy()
    expect(data.email).toBe('test@example.com')
    expect(data.magicLink).toBeTruthy()
    expect(data.magicLink).toContain('/locker/')
    expect(data.expiresAt).toBeTruthy()

    // Magic link should be properly formatted
    expect(data.magicLink).toMatch(/https?:\/\/.+\/locker\/[a-f0-9]{64}/)
  })

  test('should save items to locker', async ({ page }) => {
    // First create a locker
    const createResponse = await page.request.post('/api/locker/create-or-attach', {
      data: {
        email: 'test@example.com'
      }
    })

    const createData = await createResponse.json()
    const lockerId = createData.lockerId

    // Save a chat item
    const saveResponse = await page.request.post('/api/locker/save', {
      data: {
        lockerId,
        itemType: 'chat',
        refId: 'thread-123',
        title: 'Insurance Deductible Question',
        storagePath: null
      }
    })

    expect(saveResponse.ok()).toBeTruthy()

    const saveData = await saveResponse.json()
    expect(saveData.success).toBeTruthy()
    expect(saveData.itemId).toBeTruthy()
    expect(saveData.lockerId).toBe(lockerId)
    expect(saveData.title).toBe('Insurance Deductible Question')
  })

  test('should open locker via magic link and show saved items', async ({ page }) => {
    // Create locker and save items
    const createResponse = await page.request.post('/api/locker/create-or-attach', {
      data: {
        email: 'test@example.com'
      }
    })

    const createData = await createResponse.json()
    const lockerId = createData.lockerId
    const magicToken = createData.magicLink.split('/locker/')[1]

    // Save multiple items
    const items = [
      {
        itemType: 'chat',
        refId: 'thread-abc',
        title: 'Coverage Question'
      },
      {
        itemType: 'explainer',
        refId: 'explainer-xyz',
        title: 'Bill Explanation'
      },
      {
        itemType: 'analyzer_report',
        refId: 'case-456',
        title: 'Medical Bill Analysis',
        storagePath: 'reports/case-456.pdf'
      }
    ]

    for (const item of items) {
      await page.request.post('/api/locker/save', {
        data: {
          lockerId,
          ...item
        }
      })
    }

    // Open locker via API
    const openResponse = await page.request.get(`/api/locker/open?token=${magicToken}`)
    expect(openResponse.ok()).toBeTruthy()

    const openData = await openResponse.json()
    expect(openData.success).toBeTruthy()
    expect(openData.locker.lockerId).toBe(lockerId)
    expect(openData.items.length).toBe(3)

    // Check item types
    const itemTypes = openData.items.map((item: any) => item.item_type)
    expect(itemTypes).toContain('chat')
    expect(itemTypes).toContain('explainer')
    expect(itemTypes).toContain('analyzer_report')

    // Check signed URL generation for files
    const reportItem = openData.items.find((item: any) => item.item_type === 'analyzer_report')
    expect(reportItem.signedUrl).toBeTruthy()
  })

  test('should handle locker page UI', async ({ page }) => {
    // Create locker with items first
    const createResponse = await page.request.post('/api/locker/create-or-attach', {
      data: {
        email: 'user@example.com'
      }
    })

    const createData = await createResponse.json()
    const magicToken = createData.magicLink.split('/locker/')[1]

    // Save an item
    await page.request.post('/api/locker/save', {
      data: {
        lockerId: createData.lockerId,
        itemType: 'chat',
        refId: 'thread-test',
        title: 'Test Conversation'
      }
    })

    // Visit the locker page
    await page.goto(`/locker/${magicToken}`)

    // Should load the locker page
    await expect(page.locator('text=MyWyng Case Locker')).toBeVisible()
    await expect(page.locator('text=user@example.com')).toBeVisible()

    // Should show saved items
    await expect(page.locator('text=Test Conversation')).toBeVisible()
    await expect(page.locator('text=Chat Conversation')).toBeVisible()

    // Should have export functionality
    await expect(page.locator('text=View Details')).toBeVisible()
  })

  test('should prevent duplicate saves', async ({ page }) => {
    const createResponse = await page.request.post('/api/locker/create-or-attach', {
      data: {
        email: 'test@example.com'
      }
    })

    const lockerId = createResponse.json().then(data => data.lockerId)

    // Save item first time
    const firstSave = await page.request.post('/api/locker/save', {
      data: {
        lockerId: await lockerId,
        itemType: 'chat',
        refId: 'thread-duplicate',
        title: 'Duplicate Test'
      }
    })

    expect(firstSave.ok()).toBeTruthy()

    // Try to save same item again
    const secondSave = await page.request.post('/api/locker/save', {
      data: {
        lockerId: await lockerId,
        itemType: 'chat',
        refId: 'thread-duplicate',
        title: 'Duplicate Test Updated'
      }
    })

    expect(secondSave.status()).toBe(409) // Conflict

    const errorData = await secondSave.json()
    expect(errorData.error).toContain('already saved')
  })
})