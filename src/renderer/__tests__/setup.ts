import { beforeEach, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Mock ResizeObserver (not available in JSDOM)
global.ResizeObserver = class ResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

// Mock matchMedia (used by xterm.js for DPR detection)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock window.api (preload bridge)
const mockApi = {
  loadProjectConfig: vi.fn(),
  saveProjectConfig: vi.fn(),
  startService: vi.fn(),
  stopService: vi.fn(),
  getServiceStatus: vi.fn(),
  startLogStream: vi.fn(),
  stopLogStream: vi.fn(),
  getLogs: vi.fn(),
  clearLogs: vi.fn(),
  onLogData: vi.fn(() => vi.fn()),
  onStatusChange: vi.fn(() => vi.fn()),
  onStatsUpdate: vi.fn(() => vi.fn()),
  reanalyzeServiceEnv: vi.fn(),
  reallocatePortRange: vi.fn(),
  // Setup-related API methods
  checkPrerequisites: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  getRegistry: vi.fn(),
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
})

// Export mockApi for tests to configure
export { mockApi }

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})
