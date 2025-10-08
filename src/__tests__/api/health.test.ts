import { GET, POST } from '@/app/api/health/route'
import { NextRequest } from 'next/server'

describe('/api/health', () => {
  describe('GET', () => {
    it('should return health status', async () => {
      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('healthy')
      expect(data.version).toBeDefined()
      expect(data.services).toBeDefined()
      expect(data.endpoints).toBeDefined()
      expect(data.capabilities).toBeInstanceOf(Array)
      expect(data.limits).toBeDefined()

      // Check required services
      expect(data.services.ocrPipeline).toBeDefined()
      expect(data.services.detectionEngine).toBeDefined()
      expect(data.services.chatEngine).toBeDefined()
      expect(data.services.formatters).toBeDefined()

      // Check endpoints
      expect(data.endpoints['/api/analyzer/upload']).toBeDefined()
      expect(data.endpoints['/api/chat/message']).toBeDefined()
      expect(data.endpoints['/api/chat/upload']).toBeDefined()
      expect(data.endpoints['/api/chat/followup']).toBeDefined()

      // Check capabilities
      expect(data.capabilities).toContain('Hybrid OCR (vector text → cloud → local fallback)')
      expect(data.capabilities).toContain('18 no-benefits detection rules')
      expect(data.capabilities).toContain('Image-aware chat with healthcare expertise')
    })

    it('should include correct service information', async () => {
      const response = await GET()
      const data = await response.json()

      expect(data.services.ocrPipeline.status).toBe('operational')
      expect(data.services.ocrPipeline.engines).toEqual(['vector', 'cloud', 'local'])

      expect(data.services.detectionEngine.status).toBe('operational')
      expect(data.services.detectionEngine.ruleCount).toBe(18)

      expect(data.services.chatEngine.status).toBe('operational')
      expect(data.services.chatEngine.features).toEqual(['text_query', 'image_analysis', 'follow_up'])
    })
  })

  describe('POST', () => {
    it('should return detailed health check', async () => {
      const response = await POST()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('healthy')
      expect(data.checks).toBeInstanceOf(Array)
      expect(data.checks).toHaveLength(4)

      // Check each service
      const ocrCheck = data.checks.find((c: any) => c.service === 'OCR Pipeline')
      expect(ocrCheck.status).toBe('healthy')

      const detectionCheck = data.checks.find((c: any) => c.service === 'Detection Engine')
      expect(detectionCheck.status).toBe('healthy')

      const chatCheck = data.checks.find((c: any) => c.service === 'Chat Engine')
      expect(chatCheck.status).toBe('healthy')

      const formatterCheck = data.checks.find((c: any) => c.service === 'Output Formatters')
      expect(formatterCheck.status).toBe('healthy')
    })
  })
})