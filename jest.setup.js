// Jest setup file
// require('@testing-library/jest-dom') // Not needed for backend tests

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn().mockResolvedValue(undefined),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
    }
  },
}))

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock environment variables
process.env.NODE_ENV = 'test'

// Global test helpers
global.console = {
  ...console,
  // Suppress console.log in tests unless needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// Mock Tesseract.js for OCR tests
jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(() => ({
    loadLanguage: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
    setParameters: jest.fn().mockResolvedValue(undefined),
    recognize: jest.fn().mockResolvedValue({
      data: {
        text: 'Mock OCR text',
        confidence: 85,
        words: [
          {
            text: 'Mock',
            bbox: { x0: 0, y0: 0, x1: 50, y1: 20 },
            confidence: 90
          },
          {
            text: 'OCR',
            bbox: { x0: 50, y0: 0, x1: 80, y1: 20 },
            confidence: 85
          },
          {
            text: 'text',
            bbox: { x0: 80, y0: 0, x1: 120, y1: 20 },
            confidence: 80
          }
        ],
        lines: [
          {
            text: 'Mock OCR text',
            bbox: { x0: 0, y0: 0, x1: 120, y1: 20 }
          }
        ],
        paragraphs: [
          {
            text: 'Mock OCR text',
            bbox: { x0: 0, y0: 0, x1: 120, y1: 20 }
          }
        ]
      }
    }),
    terminate: jest.fn().mockResolvedValue(undefined),
  }))
}))

// Mock file system operations
const mockFs = {
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(() => []),
}

jest.mock('fs', () => mockFs)
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
}))

// Mock Buffer for Node.js operations
if (typeof Buffer === 'undefined') {
  global.Buffer = require('buffer').Buffer
}

// Custom matchers
expect.extend({
  toBeOneOf(received, expected) {
    const pass = expected.includes(received)
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected}`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected}`,
        pass: false,
      }
    }
  },
})

// Increase timeout for integration tests
jest.setTimeout(30000)

// Suppress warnings in tests
const originalWarn = console.warn
beforeAll(() => {
  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('ReactDOM.render is no longer supported')
    ) {
      return
    }
    originalWarn.call(console, ...args)
  }
})

afterAll(() => {
  console.warn = originalWarn
})