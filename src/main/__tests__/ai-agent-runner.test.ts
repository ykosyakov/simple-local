import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { AIAgentRunner, type AIAgentRunnerDeps } from '../services/ai-agent-runner'
import type { FileSystemOperations, AgentTerminalFactory, CommandChecker } from '../services/discovery'
import type { AgentTerminal } from '@agent-flow/agent-terminal'

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

describe('AIAgentRunner', () => {
  let runner: AIAgentRunner
  let mockFs: FileSystemOperations
  let mockTerminalFactory: AgentTerminalFactory
  let mockCommandChecker: CommandChecker
  let mockTerminal: AgentTerminal
  let mockSession: ReturnType<typeof createMockSession>
  let deps: AIAgentRunnerDeps

  beforeEach(() => {
    mockFs = createMockFileSystem()
    mockSession = createMockSession()
    mockTerminal = createMockAgentTerminal(mockSession)
    mockTerminalFactory = createMockAgentTerminalFactory(mockTerminal)
    mockCommandChecker = createMockCommandChecker(true)

    deps = {
      fileSystem: mockFs,
      agentTerminalFactory: mockTerminalFactory,
      commandChecker: mockCommandChecker,
    }

    runner = new AIAgentRunner(deps)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('run', () => {
    const baseConfig = {
      cwd: '/test/project',
      prompt: 'Test prompt',
      resultFilePath: '/test/project/.simple-local/result.json',
      allowedTools: ['Read', 'Write'],
      cliTool: 'claude' as const,
    }

    it('returns error when CLI tool is not available', async () => {
      vi.mocked(mockCommandChecker.isAvailable).mockResolvedValue(false)

      const result = await runner.run(baseConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('CLI not found')
    })

    it('creates result directory before running', async () => {
      await runner.run(baseConfig)

      expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/.simple-local', { recursive: true })
    })

    it('cleans up previous result file', async () => {
      await runner.run(baseConfig)

      expect(mockFs.unlink).toHaveBeenCalledWith('/test/project/.simple-local/result.json')
    })

    it('spawns agent terminal with correct config', async () => {
      await runner.run(baseConfig)

      expect(mockTerminalFactory.create).toHaveBeenCalled()
      expect(mockTerminal.spawn).toHaveBeenCalledWith({
        agent: 'claude',
        cwd: '/test/project',
        prompt: 'Test prompt',
        allowedTools: ['Read', 'Write'],
      })
    })

    it('disposes terminal on completion', async () => {
      await runner.run(baseConfig)

      expect(mockTerminal.dispose).toHaveBeenCalled()
    })

    it('kills session on timeout', async () => {
      await runner.run(baseConfig)

      expect(mockSession.kill).toHaveBeenCalled()
    })

    it('returns failure result on timeout', async () => {
      const result = await runner.run(baseConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('AI analysis failed')
    })

    it('calls onProgress callback with messages', async () => {
      const onProgress = vi.fn()
      await runner.run({ ...baseConfig, onProgress })

      expect(onProgress).toHaveBeenCalled()
    })

    it('subscribes to raw$ and events$ streams', async () => {
      await runner.run(baseConfig)

      expect(mockSession.raw$.subscribe).toHaveBeenCalled()
      expect(mockSession.events$.subscribe).toHaveBeenCalled()
    })

    it('unsubscribes from streams on completion', async () => {
      const unsubscribeFn = vi.fn()
      vi.mocked(mockSession.raw$.subscribe).mockReturnValue({ unsubscribe: unsubscribeFn })
      vi.mocked(mockSession.events$.subscribe).mockReturnValue({ unsubscribe: unsubscribeFn })

      await runner.run(baseConfig)

      expect(unsubscribeFn).toHaveBeenCalled()
    })
  })
})
