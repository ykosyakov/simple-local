import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  DiscoveryService,
  type FileSystemOperations,
  type AgentTerminalFactory,
  type CommandChecker,
  slugify,
  makeUniqueId,
  allocatePort,
  detectHardcodedPort,
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

    it('skips directories that cannot be read and logs at debug level', async () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      vi.mocked(mockFs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === '/project') {
          return [
            { name: 'package.json', isDirectory: () => false, isFile: () => true },
            { name: 'private', isDirectory: () => true, isFile: () => false },
          ]
        }
        if (String(dirPath).includes('private')) {
          throw new Error('EACCES: permission denied')
        }
        return []
      })

      const result = await discovery.scanProjectStructure('/project')

      // Should still find the package.json
      expect(result.packageJsonPaths).toHaveLength(1)
      // Should log at debug level about the skipped directory
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[Discovery\].*Skipping directory.*private.*EACCES/)
      )
      debugSpy.mockRestore()
    })

    it('continues scanning after directory read error', async () => {
      vi.mocked(mockFs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === '/project') {
          return [
            { name: 'accessible', isDirectory: () => true, isFile: () => false },
            { name: 'protected', isDirectory: () => true, isFile: () => false },
          ]
        }
        if (String(dirPath).includes('protected')) {
          throw new Error('EACCES: permission denied')
        }
        if (String(dirPath).includes('accessible')) {
          return [{ name: 'package.json', isDirectory: () => false, isFile: () => true }]
        }
        return []
      })

      const result = await discovery.scanProjectStructure('/project')

      // Should still find files in accessible directories
      expect(result.packageJsonPaths).toHaveLength(1)
      expect(result.packageJsonPaths[0]).toContain('accessible')
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

    it('uses custom basePort for port allocation', async () => {
      vi.mocked(mockFs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === '/project') {
          return [
            { name: 'frontend', isDirectory: () => true, isFile: () => false },
            { name: 'backend', isDirectory: () => true, isFile: () => false },
          ]
        }
        if (String(dirPath).includes('frontend')) {
          return [{ name: 'package.json', isDirectory: () => false, isFile: () => true }]
        }
        if (String(dirPath).includes('backend')) {
          return [{ name: 'package.json', isDirectory: () => false, isFile: () => true }]
        }
        return []
      })
      vi.mocked(mockFs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('frontend')) {
          return JSON.stringify({
            name: 'frontend-app',
            scripts: { dev: 'vite dev' },
            dependencies: {},
          })
        }
        return JSON.stringify({
          name: 'backend-api',
          scripts: { dev: 'node server.js' },
          dependencies: {},
        })
      })

      const result = await discovery.basicDiscovery('/project', 3100)

      expect(result.services).toHaveLength(2)
      // Ports should start from 3100, not 3000
      expect(result.services[0].port).toBe(3100)
      expect(result.services[1].port).toBe(3101)
    })

    it('stores both discovered and allocated ports', async () => {
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
        scripts: { dev: 'vite dev --port 5173' },
        dependencies: {},
      }))

      const result = await discovery.basicDiscovery('/project', 3100)

      expect(result.services).toHaveLength(1)
      const service = result.services[0]
      // Allocated port should be used as the active port
      expect(service.port).toBe(3100)
      expect(service.allocatedPort).toBe(3100)
      // Discovered port should be preserved from package.json
      expect(service.discoveredPort).toBe(5173)
    })

    it('allocates debug ports from project debug range', async () => {
      vi.mocked(mockFs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === '/project') {
          return [
            { name: 'frontend', isDirectory: () => true, isFile: () => false },
            { name: 'backend', isDirectory: () => true, isFile: () => false },
          ]
        }
        if (String(dirPath).includes('frontend')) {
          return [{ name: 'package.json', isDirectory: () => false, isFile: () => true }]
        }
        if (String(dirPath).includes('backend')) {
          return [{ name: 'package.json', isDirectory: () => false, isFile: () => true }]
        }
        return []
      })
      vi.mocked(mockFs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('frontend')) {
          return JSON.stringify({
            name: 'frontend-app',
            scripts: { dev: 'vite dev' },
            dependencies: {},
          })
        }
        return JSON.stringify({
          name: 'backend-api',
          scripts: { dev: 'node server.js' },
          dependencies: {},
        })
      })

      const result = await discovery.basicDiscovery('/project', 3100, 9210)

      expect(result.services).toHaveLength(2)
      // Debug ports should start from 9210
      expect(result.services[0].debugPort).toBe(9210)
      expect(result.services[0].allocatedDebugPort).toBe(9210)
      expect(result.services[1].debugPort).toBe(9211)
      expect(result.services[1].allocatedDebugPort).toBe(9211)
    })

    it('services get unique ports even when none discovered', async () => {
      vi.mocked(mockFs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === '/project') {
          return [
            { name: 'api', isDirectory: () => true, isFile: () => false },
            { name: 'worker', isDirectory: () => true, isFile: () => false },
          ]
        }
        if (String(dirPath).includes('api')) {
          return [{ name: 'package.json', isDirectory: () => false, isFile: () => true }]
        }
        if (String(dirPath).includes('worker')) {
          return [{ name: 'package.json', isDirectory: () => false, isFile: () => true }]
        }
        return []
      })
      vi.mocked(mockFs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('api')) {
          return JSON.stringify({
            name: 'api-service',
            scripts: { dev: 'node index.js' },
            dependencies: {},
          })
        }
        return JSON.stringify({
          name: 'worker-service',
          scripts: { dev: 'node worker.js' },
          dependencies: {},
        })
      })

      const result = await discovery.basicDiscovery('/project', 3000)

      expect(result.services).toHaveLength(2)
      // Both should have unique allocated ports
      const ports = result.services.map(s => s.port)
      expect(new Set(ports).size).toBe(2)
      // discoveredPort should be undefined when not in package.json
      expect(result.services[0].discoveredPort).toBeUndefined()
      expect(result.services[1].discoveredPort).toBeUndefined()
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

describe('slugify', () => {
  it('converts text to lowercase', () => {
    expect(slugify('HelloWorld')).toBe('helloworld')
  })

  it('replaces non-alphanumeric characters with hyphens', () => {
    expect(slugify('My App Name')).toBe('my-app-name')
    expect(slugify('service@2.0')).toBe('service-2-0')
  })

  it('removes leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello')
    expect(slugify('  hello  ')).toBe('hello')
  })

  it('limits length to 50 characters', () => {
    const longName = 'a'.repeat(100)
    expect(slugify(longName).length).toBeLessThanOrEqual(50)
  })

  it('returns "service" for empty or all-special-char input', () => {
    expect(slugify('')).toBe('service')
    expect(slugify('---')).toBe('service')
    expect(slugify('   ')).toBe('service')
  })
})

describe('makeUniqueId', () => {
  it('returns base ID if not in use', () => {
    const usedIds = new Set<string>()
    expect(makeUniqueId('backend', usedIds)).toBe('backend')
  })

  it('appends -2 suffix for first collision', () => {
    const usedIds = new Set(['backend'])
    expect(makeUniqueId('backend', usedIds)).toBe('backend-2')
  })

  it('increments suffix for multiple collisions', () => {
    const usedIds = new Set(['backend', 'backend-2', 'backend-3'])
    expect(makeUniqueId('backend', usedIds)).toBe('backend-4')
  })
})

describe('allocatePort', () => {
  it('returns base port if available', () => {
    const usedPorts = new Set<number>()
    expect(allocatePort(3000, usedPorts)).toBe(3000)
  })

  it('finds next available port when base is in use', () => {
    const usedPorts = new Set([3000])
    expect(allocatePort(3000, usedPorts)).toBe(3001)
  })

  it('skips multiple used ports', () => {
    const usedPorts = new Set([3000, 3001, 3002])
    expect(allocatePort(3000, usedPorts)).toBe(3003)
  })

  it('handles gaps in used ports', () => {
    const usedPorts = new Set([3000, 3002])
    expect(allocatePort(3000, usedPorts)).toBe(3001)
  })
})

describe('hardcodedPort detection', () => {
  it('detects hardcoded port in command flag', () => {
    const command = 'next dev -p 3001'
    const result = detectHardcodedPort(command)
    expect(result).toEqual({
      value: 3001,
      source: 'command-flag',
      flag: '-p',
    })
  })

  it('detects --port flag', () => {
    const command = 'vite --port 5173'
    const result = detectHardcodedPort(command)
    expect(result).toEqual({
      value: 5173,
      source: 'command-flag',
      flag: '--port',
    })
  })

  it('detects --port= syntax', () => {
    const command = 'vite --port=5173'
    const result = detectHardcodedPort(command)
    expect(result).toEqual({
      value: 5173,
      source: 'command-flag',
      flag: '--port',
    })
  })

  it('returns undefined for env var ports', () => {
    const command = 'next dev -p ${PORT:-3000}'
    const result = detectHardcodedPort(command)
    expect(result).toBeUndefined()
  })

  it('returns undefined for $PORT reference', () => {
    const command = 'next dev -p $PORT'
    const result = detectHardcodedPort(command)
    expect(result).toBeUndefined()
  })
})

describe('convertToProjectConfig hardcodedPort', () => {
  it('sets hardcodedPort when command has -p flag', async () => {
    const mockFs = createMockFileSystem()
    const discovery = new DiscoveryService({
      fileSystem: mockFs,
      agentTerminalFactory: createMockAgentTerminalFactory(),
      commandChecker: createMockCommandChecker(true),
    })

    // Access private method via any cast for testing
    const config = (discovery as any).convertToProjectConfig(
      {
        services: [{
          id: 'web',
          name: 'Web',
          path: '.',
          command: 'next dev -p 3001',
          port: 3001,
        }],
      },
      '/project',
      3000,
      9200
    )

    expect(config.services[0].hardcodedPort).toEqual({
      value: 3001,
      source: 'command-flag',
      flag: '-p',
    })
  })

  it('does not set hardcodedPort when using env var', async () => {
    const discovery = new DiscoveryService({
      fileSystem: createMockFileSystem(),
      agentTerminalFactory: createMockAgentTerminalFactory(),
      commandChecker: createMockCommandChecker(true),
    })

    const config = (discovery as any).convertToProjectConfig(
      {
        services: [{
          id: 'web',
          name: 'Web',
          path: '.',
          command: 'next dev -p ${PORT:-3000}',
          port: 3000,
        }],
      },
      '/project',
      3000,
      9200
    )

    expect(config.services[0].hardcodedPort).toBeUndefined()
  })
})

describe('externalCallbackUrls', () => {
  it('passes through externalCallbackUrls from AI output to service', async () => {
    const discovery = new DiscoveryService({
      fileSystem: createMockFileSystem(),
      agentTerminalFactory: createMockAgentTerminalFactory(),
      commandChecker: createMockCommandChecker(true),
    })

    const aiOutput = {
      services: [
        {
          id: 'frontend',
          name: 'Frontend',
          path: 'apps/web',
          command: 'npm run dev',
          port: 3000,
          env: {},
          externalCallbackUrls: [
            {
              envVar: 'NEXT_PUBLIC_CLERK_CALLBACK',
              provider: 'Clerk',
              description: 'OAuth callback URL',
            },
          ],
        },
      ],
      connections: [],
    }

    const result = (discovery as any).convertToProjectConfig(aiOutput, '/test/project', 3000, 9200)

    expect(result.services[0].externalCallbackUrls).toEqual([
      {
        envVar: 'NEXT_PUBLIC_CLERK_CALLBACK',
        provider: 'Clerk',
        description: 'OAuth callback URL',
      },
    ])
  })

  it('handles missing externalCallbackUrls gracefully', async () => {
    const discovery = new DiscoveryService({
      fileSystem: createMockFileSystem(),
      agentTerminalFactory: createMockAgentTerminalFactory(),
      commandChecker: createMockCommandChecker(true),
    })

    const aiOutput = {
      services: [
        {
          id: 'backend',
          name: 'Backend',
          path: 'apps/api',
          command: 'npm run dev',
          port: 4000,
          env: {},
        },
      ],
      connections: [],
    }

    const result = (discovery as any).convertToProjectConfig(aiOutput, '/test/project', 3000, 9200)

    expect(result.services[0].externalCallbackUrls).toBeUndefined()
  })
})
