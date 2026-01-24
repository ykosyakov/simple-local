import { beforeEach, vi } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/simple-run-test'),
    getName: vi.fn(() => 'simple-run'),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})
