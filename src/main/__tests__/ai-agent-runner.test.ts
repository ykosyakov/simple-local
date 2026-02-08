import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NEVER, Subject } from 'rxjs'
import { AIAgentRunner, type AIAgentRunnerDeps } from '../services/ai-agent-runner'
import type { FileSystemOperations, AgentTerminalFactory, CommandChecker } from '../services/discovery'
import type { AgentTerminal } from '../modules/agent-terminal'

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
  const events$ = new Subject()
  return {
    id: 'test-session-id',
    events$: events$ as typeof events$ & { subscribe: ReturnType<typeof vi.fn> },
    pty: { exit$: NEVER },
    kill: vi.fn(),
    // Keep reference for tests that need to emit events
    _eventsSubject: events$,
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

    it('keeps previous result file for debugging', async () => {
      await runner.run(baseConfig)

      expect(mockFs.unlink).not.toHaveBeenCalled()
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

    it('subscribes to events$ for progress reporting', async () => {
      const subscribeSpy = vi.spyOn(mockSession.events$, 'subscribe')
      await runner.run(baseConfig)

      expect(subscribeSpy).toHaveBeenCalled()
    })

    it('forwards structured events to onProgress', async () => {
      const { firstValueFrom } = await import('rxjs')
      const onProgress = vi.fn()

      // Control when firstValueFrom resolves so we can emit events before completion
      let resolveCompletion: () => void
      const completionGate = new Promise<void>((r) => { resolveCompletion = r })
      vi.mocked(firstValueFrom).mockImplementationOnce(() => completionGate)

      const customSession = createMockSession()
      const customTerminal = {
        spawn: vi.fn().mockReturnValue(customSession),
        dispose: vi.fn(),
      } as unknown as AgentTerminal
      const customFactory: AgentTerminalFactory = {
        create: vi.fn().mockReturnValue(customTerminal),
      }

      const customRunner = new AIAgentRunner({
        fileSystem: mockFs,
        agentTerminalFactory: customFactory,
        commandChecker: mockCommandChecker,
      })

      const runPromise = customRunner.run({ ...baseConfig, onProgress })

      // Let the async function proceed past awaits to reach subscribe
      await new Promise((r) => setTimeout(r, 0))

      // Simulate events via the subject
      customSession._eventsSubject.next({ type: 'tool-start', tool: 'Read', input: '/path/to/file' })
      expect(onProgress).toHaveBeenCalledWith('Using Read...', '> Read(/path/to/file)')

      customSession._eventsSubject.next({ type: 'thinking', text: 'analyzing...' })
      expect(onProgress).toHaveBeenCalledWith('Thinking...', undefined)

      // Let the runner complete (simulates task-complete or exit)
      resolveCompletion!()
      await runPromise
    })
  })
})
