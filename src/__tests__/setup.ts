import '@testing-library/jest-dom'

// Mock IntersectionObserver for components that use it
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock ResizeObserver for components that use it
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock fetch for API tests
global.fetch = jest.fn()

// Mock File constructor for file upload tests
if (!global.File) {
  global.File = class File {
    constructor(fileBits: any[], fileName: string, options?: any) {
      this.name = fileName
      this.size = fileBits.reduce((size, bit) => size + (bit.length || 0), 0)
      this.type = options?.type || ''
      this.lastModified = Date.now()
    }
    name: string
    size: number
    type: string
    lastModified: number
  } as any
}

// Suppress console warnings in tests
const originalConsoleWarn = console.warn
console.warn = (...args: any[]) => {
  if (args[0]?.includes?.('not installed')) {
    return // Suppress dependency warnings in tests
  }
  originalConsoleWarn(...args)
}