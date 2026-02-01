import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import { exec } from 'child_process'
import { PortExtractionService } from '../services/port-extraction'
import type { Service } from '../../shared/types'

vi.mock('fs/promises')
vi.mock('child_process', () => ({
  exec: vi.fn(),
}))

const mockService: Service = {
  id: 'web',
  name: 'Web Frontend',
  path: 'packages/web',
  command: 'next dev -p 3001',
  port: 3000,
  env: {},
  active: true,
  mode: 'native',
  hardcodedPort: {
    value: 3001,
    source: 'command-flag',
    flag: '-p',
  },
}

describe('PortExtractionService', () => {
  it('exists and can be instantiated', () => {
    const service = new PortExtractionService({})
    expect(service).toBeInstanceOf(PortExtractionService)
  })

  it('has analyzeService method', () => {
    const service = new PortExtractionService({})
    expect(typeof service.analyzeService).toBe('function')
  })

  it('has applyChanges method', () => {
    const service = new PortExtractionService({})
    expect(typeof service.applyChanges).toBe('function')
  })
})

describe('applyChanges', () => {
  beforeEach(() => {
    vi.mocked(fs.readFile).mockResolvedValue('')
    vi.mocked(fs.writeFile).mockResolvedValue()
    vi.mocked(fs.appendFile).mockResolvedValue()
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies file changes', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('"dev": "next dev -p 3001"')

    const service = new PortExtractionService({})
    const result = await service.applyChanges(
      '/project',
      mockService,
      {
        changes: [{
          file: 'package.json',
          description: 'Update dev script',
          before: 'next dev -p 3001',
          after: 'next dev -p ${PORT:-3001}',
        }],
        envAdditions: { PORT: '3001' },
        warnings: [],
      }
    )

    expect(result.success).toBe(true)
    expect(fs.writeFile).toHaveBeenCalled()
  })

  it('creates .env file with PORT if missing', async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).includes('package.json')) {
        return '"dev": "next dev -p 3001"'
      }
      throw new Error('ENOENT')
    })
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'))

    const service = new PortExtractionService({})
    await service.applyChanges(
      '/project',
      { ...mockService, path: '.' },
      {
        changes: [{
          file: 'package.json',
          description: 'Update dev script',
          before: 'next dev -p 3001',
          after: 'next dev -p ${PORT:-3001}',
        }],
        envAdditions: { PORT: '3001' },
        warnings: [],
      }
    )

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.stringContaining('PORT=3001'),
      'utf-8'
    )
  })

  it('appends to existing .env file', async () => {
    vi.mocked(fs.access).mockResolvedValue()
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).endsWith('.env')) {
        return 'EXISTING_VAR=value\n'
      }
      return '"dev": "next dev -p 3001"'
    })

    const service = new PortExtractionService({})
    await service.applyChanges(
      '/project',
      { ...mockService, path: '.' },
      {
        changes: [{
          file: 'package.json',
          description: 'Update dev script',
          before: 'next dev -p 3001',
          after: 'next dev -p ${PORT:-3001}',
        }],
        envAdditions: { PORT: '3001' },
        warnings: [],
      }
    )

    expect(fs.appendFile).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.stringContaining('PORT=3001'),
      'utf-8'
    )
  })

  it('creates git commit when commit option is true', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('"dev": "next dev -p 3001"')
    vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
      if (callback) callback(null, '', '')
      return {} as ReturnType<typeof exec>
    })

    const service = new PortExtractionService({})
    await service.applyChanges(
      '/project',
      { ...mockService, path: '.' },
      {
        changes: [{
          file: 'package.json',
          description: 'Update dev script',
          before: 'next dev -p 3001',
          after: 'next dev -p ${PORT:-3001}',
        }],
        envAdditions: {},
        warnings: [],
      },
      { commit: true }
    )

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('git add'),
      expect.any(Object),
      expect.any(Function)
    )
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('git commit'),
      expect.any(Object),
      expect.any(Function)
    )
  })

  it('does not commit when commit option is false', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('"dev": "next dev -p 3001"')

    const service = new PortExtractionService({})
    await service.applyChanges(
      '/project',
      { ...mockService, path: '.' },
      {
        changes: [{
          file: 'package.json',
          description: 'Update dev script',
          before: 'next dev -p 3001',
          after: 'next dev -p ${PORT:-3001}',
        }],
        envAdditions: {},
        warnings: [],
      },
      { commit: false }
    )

    expect(exec).not.toHaveBeenCalled()
  })
})
