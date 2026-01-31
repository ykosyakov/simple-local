import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  DiscoveryService,
  type FileSystemOperations,
  type AgentTerminalFactory,
  type CommandChecker,
} from '../services/discovery'
import type { AgentTerminal } from '@agent-flow/agent-terminal'

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

// Factory functions for creating mocks
function createMockFileSystem(overrides: Partial<FileSystemOperations> = {}): FileSystemOperations {
  return {
    readFile: vi.fn().mockRejectedValue(new Error('readFile not implemented')),
    readdir: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockRejectedValue(new Error('file not found')),
    ...overrides,
  }
}

function createMockSession() {
  return {
    id: 'test-session-id',
    raw$: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
    events$: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
    pty: { exit$: { pipe: vi.fn().mockReturnValue({}) } },
    kill: vi.fn(),
  }
}

function createMockAgentTerminal(session = createMockSession()) {
  return {
    spawn: vi.fn().mockReturnValue(session),
    dispose: vi.fn(),
  } as unknown as AgentTerminal
}

function createMockAgentTerminalFactory(terminal?: AgentTerminal): AgentTerminalFactory {
  return {
    create: vi.fn().mockReturnValue(terminal ?? createMockAgentTerminal()),
  }
}

function createMockCommandChecker(available = true): CommandChecker {
  return {
    isAvailable: vi.fn().mockResolvedValue(available),
  }
}

// Mock rxjs firstValueFrom to simulate timeout
vi.mock('rxjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('rxjs')>()
  return {
    ...actual,
    firstValueFrom: vi.fn().mockRejectedValue(new Error('timeout')),
  }
})

describe('DiscoveryService', () => {
  let discovery: DiscoveryService
  let mockFs: FileSystemOperations
  let mockTerminalFactory: AgentTerminalFactory
  let mockCommandChecker: CommandChecker
  let mockTerminal: AgentTerminal
  let mockSession: ReturnType<typeof createMockSession>

  beforeEach(() => {
    mockFs = createMockFileSystem()
    mockSession = createMockSession()
    mockTerminal = createMockAgentTerminal(mockSession)
    mockTerminalFactory = createMockAgentTerminalFactory(mockTerminal)
    mockCommandChecker = createMockCommandChecker(true)

    discovery = new DiscoveryService({
      fileSystem: mockFs,
      agentTerminalFactory: mockTerminalFactory,
      commandChecker: mockCommandChecker,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('scanProjectStructure', () => {
    it('detects package.json files', async () => {
      vi.mocked(mockFs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === '/project') {
          return [
            { name: 'frontend', isDirectory: () => true, isFile: () => false },
            { name: 'backend', isDirectory: () => true, isFile: () => false },
            { name: 'package.json', isDirectory: () => false, isFile: () => true },
          ]
        }
        if (String(dirPath).includes('frontend')) {
          return [{ name: 'package.json', isDirectory: () => false, isFile: () => true }]
        }
        return []
      })

      const result = await discovery.scanProjectStructure('/project')
      expect(result.packageJsonPaths.length).toBeGreaterThan(0)
    })

    it('detects docker-compose files', async () => {
      vi.mocked(mockFs.readdir).mockResolvedValue([
        { name: 'docker-compose.yml', isDirectory: () => false, isFile: () => true },
        { name: 'docker-compose.yaml', isDirectory: () => false, isFile: () => true },
      ])

      const result = await discovery.scanProjectStructure('/project')
      expect(result.dockerComposePaths).toHaveLength(2)
    })

    it('detects env files', async () => {
      vi.mocked(mockFs.readdir).mockResolvedValue([
        { name: '.env', isDirectory: () => false, isFile: () => true },
        { name: '.env.local', isDirectory: () => false, isFile: () => true },
        { name: '.env.production', isDirectory: () => false, isFile: () => true },
      ])

      const result = await discovery.scanProjectStructure('/project')
      expect(result.envFiles).toHaveLength(3)
    })

    it('respects depth limit', async () => {
      const readdirMock = vi.mocked(mockFs.readdir)
      readdirMock.mockImplementation(async (dirPath) => {
        if (dirPath === '/project') {
          return [{ name: 'level1', isDirectory: () => true, isFile: () => false }]
        }
        if (String(dirPath).includes('level1') && !String(dirPath).includes('level2')) {
          return [{ name: 'level2', isDirectory: () => true, isFile: () => false }]
        }
        if (String(dirPath).includes('level2')) {
          return [{ name: 'level3', isDirectory: () => true, isFile: () => false }]
        }
        return []
      })

      await discovery.scanProjectStructure('/project', 1)
      // Should not scan beyond level 2
      expect(readdirMock).toHaveBeenCalledWith('/project', { withFileTypes: true })
      expect(readdirMock).toHaveBeenCalledWith('/project/level1', { withFileTypes: true })
      expect(readdirMock).not.toHaveBeenCalledWith('/project/level1/level2', expect.anything())
    })
  })

  describe('parsePackageJson', () => {
    it('extracts dev script and dependencies', async () => {
      vi.mocked(mockFs.readFile).mockResolvedValue(JSON.stringify({
        name: 'frontend',
        scripts: { dev: 'next dev -p 3000' },
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
      }))

      const result = await discovery.parsePackageJson('/project/frontend/package.json')

      expect(result.name).toBe('frontend')
      expect(result.devScript).toBe('next dev -p 3000')
      expect(result.framework).toBe('next')
    })

    it('extracts port from --port flag', async () => {
      vi.mocked(mockFs.readFile).mockResolvedValue(JSON.stringify({
        name: 'app',
        scripts: { dev: 'vite --port 5173' },
        dependencies: {},
      }))

      const result = await discovery.parsePackageJson('/project/app/package.json')
      expect(result.port).toBe(5173)
    })

    it('detects express framework', async () => {
      vi.mocked(mockFs.readFile).mockResolvedValue(JSON.stringify({
        name: 'api',
        scripts: { dev: 'ts-node src/index.ts' },
        dependencies: { express: '^4.18.0' },
      }))

      const result = await discovery.parsePackageJson('/project/api/package.json')
      expect(result.framework).toBe('express')
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
    it('returns null and disposes terminal on timeout', async () => {
      const result = await discovery.runAIDiscovery('/test/project', 'claude', vi.fn())

      expect(result).toBeNull()
      expect(mockTerminal.dispose).toHaveBeenCalled()
    })

    it('kills session on timeout', async () => {
      await discovery.runAIDiscovery('/test/project', 'claude', vi.fn())

      expect(mockSession.kill).toHaveBeenCalled()
    })

    it('returns null when CLI tool is not available', async () => {
      vi.mocked(mockCommandChecker.isAvailable).mockResolvedValue(false)

      const onProgress = vi.fn()
      const result = await discovery.runAIDiscovery('/test/project', 'claude', onProgress)

      expect(result).toBeNull()
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'error', message: expect.stringContaining('CLI not found') })
      )
    })

    it('creates result directory', async () => {
      await discovery.runAIDiscovery('/test/project', 'claude', vi.fn())

      expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/.simple-local', { recursive: true })
    })

    it('uses injected agent terminal factory', async () => {
      await discovery.runAIDiscovery('/test/project', 'claude', vi.fn())

      expect(mockTerminalFactory.create).toHaveBeenCalled()
      expect(mockTerminal.spawn).toHaveBeenCalled()
    })
  })

  describe('runEnvAnalysis', () => {
    it('returns empty array and disposes terminal on timeout', async () => {
      const result = await discovery.runEnvAnalysis('/test/project', testService, 'claude', vi.fn())

      expect(result).toEqual([])
      expect(mockTerminal.dispose).toHaveBeenCalled()
    })

    it('returns empty array when CLI tool is not available', async () => {
      vi.mocked(mockCommandChecker.isAvailable).mockResolvedValue(false)

      const onProgress = vi.fn()
      const result = await discovery.runEnvAnalysis('/test/project', testService, 'claude', onProgress)

      expect(result).toEqual([])
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'error', message: expect.stringContaining('CLI not found') })
      )
    })

    it('creates result directory for specific service', async () => {
      await discovery.runEnvAnalysis('/test/project', testService, 'claude', vi.fn())

      expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/.simple-local', { recursive: true })
    })
  })

  describe('basicDiscovery', () => {
    it('returns config from scanned package.json files', async () => {
      vi.mocked(mockFs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === '/project') {
          return [
            { name: 'package.json', isDirectory: () => false, isFile: () => true },
          ]
        }
        return []
      })
      vi.mocked(mockFs.readFile).mockResolvedValue(JSON.stringify({
        name: 'my-app',
        scripts: { dev: 'vite dev' },
        dependencies: {},
      }))

      const result = await discovery.basicDiscovery('/project')

      expect(result.name).toBe('project')
      expect(result.services).toHaveLength(1)
      expect(result.services[0].name).toBe('my-app')
    })
  })

  describe('backward compatibility', () => {
    it('works with no dependencies (uses defaults)', () => {
      // This should not throw - uses default implementations
      const service = new DiscoveryService()
      expect(service).toBeInstanceOf(DiscoveryService)
    })
  })
})
