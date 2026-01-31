import { beforeEach, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

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
  reanalyzeServiceEnv: vi.fn(),
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
