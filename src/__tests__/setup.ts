/**
 * Jest setup file for WyngAI tests
 */

import '@testing-library/jest-dom'

// Mock environment variables
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE = 'test-service-role-key'
process.env.OPENAI_API_KEY = 'test-openai-key'
process.env.SENDGRID_API_KEY = 'test-sendgrid-key'
process.env.NEXT_PUBLIC_BASE_URL = 'https://test.getwyng.co'

// Mock Supabase client to avoid actual database calls in tests
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      })),
      insert: jest.fn(() => Promise.resolve({ data: null, error: null })),
      upsert: jest.fn(() => Promise.resolve({ data: null, error: null })),
      update: jest.fn(() => Promise.resolve({ data: null, error: null }))
    })),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(() => Promise.resolve({ data: null, error: null })),
        createSignedUrl: jest.fn(() => Promise.resolve({
          data: { signedUrl: 'https://test.com/file.pdf' },
          error: null
        }))
      }))
    },
    rpc: jest.fn(() => Promise.resolve({ data: 'test-token', error: null }))
  }))
}))

// Mock fetch for external API calls
global.fetch = jest.fn()

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}