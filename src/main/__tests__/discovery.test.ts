import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DiscoveryService } from '../services/discovery'
import * as fs from 'fs/promises'

// Mock fs/promises - required for file system operations
vi.mock('fs/promises')

// Mock child_process.exec for CLI availability checks
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    exec: vi.fn((_cmd, cb) => cb?.(null, { stdout: '/usr/bin/claude', stderr: '' })),
  }
})

// Mock AgentTerminal - shared mock session for assertions
const mockSession = {
  id: 'test-session-id',
  raw$: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
  events$: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
  pty: { exit$: { pipe: vi.fn().mockReturnValue({}) } },
  kill: vi.fn(),
}

const mockDispose = vi.fn()

vi.mock('@agent-flow/agent-terminal', () => ({
  AgentTerminal: class MockAgentTerminal {
    spawn = vi.fn().mockReturnValue(mockSession)
    dispose = mockDispose
  },
}))

// Mock rxjs firstValueFrom to simulate timeout
vi.mock('rxjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('rxjs')>()
  return {
    ...actual,
    firstValueFrom: vi.fn().mockRejectedValue(new Error('timeout')),
  }
})

// Test fixtures
const testService = {
  id: 'backend',
  name: 'Backend API',
  path: 'packages/backend',
  command: 'pnpm start:dev',
  port: 3500,
  env: {},
  active: true,
  mode: 'container' as const,
}

describe('DiscoveryService', () => {
  let discovery: DiscoveryService

  beforeEach(() => {
    discovery = new DiscoveryService()
    vi.clearAllMocks()
  })

  describe('scanProjectStructure', () => {
    it('detects package.json files', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === '/project') {
          return [
            { name: 'frontend', isDirectory: () => true, isFile: () => false },
            { name: 'backend', isDirectory: () => true, isFile: () => false },
            { name: 'package.json', isDirectory: () => false, isFile: () => true },
          ] as any
        }
        if (String(dirPath).includes('frontend')) {
          return [{ name: 'package.json', isDirectory: () => false, isFile: () => true }] as any
        }
        return []
      })

      const result = await discovery.scanProjectStructure('/project')
      expect(result.packageJsonPaths.length).toBeGreaterThan(0)
    })
  })

  describe('parsePackageJson', () => {
    it('extracts dev script and dependencies', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        name: 'frontend',
        scripts: { dev: 'next dev -p 3000' },
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
      }))

      const result = await discovery.parsePackageJson('/project/frontend/package.json')

      expect(result.name).toBe('frontend')
      expect(result.devScript).toBe('next dev -p 3000')
      expect(result.framework).toBe('next')
    })
  })

  describe('buildDiscoveryPrompt', () => {
    it('creates structured prompt for AI', () => {
      const prompt = discovery.buildDiscoveryPrompt(
        {
          packageJsonPaths: ['/project/frontend/package.json'],
          dockerComposePaths: [],
          envFiles: ['/project/frontend/.env'],
          makefilePaths: [],
          toolConfigPaths: [],
        },
        '/project/.simple-local/discovery-result.json'
      )

      expect(prompt).toContain('package.json')
      expect(prompt).toContain('JSON')
      expect(prompt).toContain('discovery-result.json')
    })
  })

  describe('buildEnvAnalysisPrompt', () => {
    it('generates prompt with service path and result file', () => {
      const prompt = discovery.buildEnvAnalysisPrompt(
        '/projects/myapp',
        testService,
        '/projects/myapp/.simple-local/env-analysis-backend.json'
      )

      expect(prompt).toContain('packages/backend')
      expect(prompt).toContain('Backend API')
      expect(prompt).toContain('env-analysis-backend.json')
      expect(prompt).toContain('localhost')
      expect(prompt).toContain('host.docker.internal')
    })
  })

  describe('runAIDiscovery', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined)
      vi.mocked(fs.unlink).mockRejectedValue(new Error('file not found'))
      vi.mocked(fs.readdir).mockResolvedValue([])
    })

    it('returns null and disposes terminal on timeout', async () => {
      const { exec } = await import('child_process')
      vi.mocked(exec).mockImplementation((_cmd, cb: any) => cb?.(null, { stdout: '/usr/bin/claude', stderr: '' }))

      const result = await discovery.runAIDiscovery('/test/project', 'claude', vi.fn())

      expect(result).toBeNull()
      expect(mockDispose).toHaveBeenCalled()
    })

    it('kills session on timeout', async () => {
      const { exec } = await import('child_process')
      vi.mocked(exec).mockImplementation((_cmd, cb: any) => cb?.(null, { stdout: '/usr/bin/claude', stderr: '' }))

      await discovery.runAIDiscovery('/test/project', 'claude', vi.fn())

      expect(mockSession.kill).toHaveBeenCalled()
    })

    it('returns null when CLI tool is not available', async () => {
      const { exec } = await import('child_process')
      vi.mocked(exec).mockImplementation((_cmd, cb: any) => cb?.(new Error('not found'), { stdout: '', stderr: '' }))

      const onProgress = vi.fn()
      const result = await discovery.runAIDiscovery('/test/project', 'claude', onProgress)

      expect(result).toBeNull()
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'error', message: expect.stringContaining('CLI not found') })
      )
    })
  })

  describe('runEnvAnalysis', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined)
      vi.mocked(fs.unlink).mockRejectedValue(new Error('file not found'))
    })

    it('returns empty array and disposes terminal on timeout', async () => {
      const { exec } = await import('child_process')
      vi.mocked(exec).mockImplementation((_cmd, cb: any) => cb?.(null, { stdout: '/usr/bin/claude', stderr: '' }))

      const result = await discovery.runEnvAnalysis('/test/project', testService, 'claude', vi.fn())

      expect(result).toEqual([])
      expect(mockDispose).toHaveBeenCalled()
    })

    it('returns empty array when CLI tool is not available', async () => {
      const { exec } = await import('child_process')
      vi.mocked(exec).mockImplementation((_cmd, cb: any) => cb?.(new Error('not found'), { stdout: '', stderr: '' }))

      const onProgress = vi.fn()
      const result = await discovery.runEnvAnalysis('/test/project', testService, 'claude', onProgress)

      expect(result).toEqual([])
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'error', message: expect.stringContaining('CLI not found') })
      )
    })
  })
})
