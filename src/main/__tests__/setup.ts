import { beforeEach, vi } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/simple-local-test'),
    getName: vi.fn(() => 'simple-local'),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})
