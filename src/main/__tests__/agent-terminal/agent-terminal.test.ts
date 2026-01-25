import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentTerminal } from '../../services/agent-terminal/agent-terminal'

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 1234,
  })),
}))

describe('AgentTerminal', () => {
  let terminal: AgentTerminal

  beforeEach(() => {
    vi.clearAllMocks()
    terminal = new AgentTerminal()
  })

  describe('spawn', () => {
    it('creates a new session', () => {
      const session = terminal.spawn({
        agent: 'claude',
        cwd: '/test/path',
      })

      expect(session.id).toBeDefined()
      expect(session.agent).toBe('claude')

      terminal.dispose()
    })

    it('tracks session in manager', () => {
      const session = terminal.spawn({
        agent: 'claude',
        cwd: '/test/path',
      })

      expect(terminal.get(session.id)).toBe(session)
      expect(terminal.getAll()).toHaveLength(1)

      terminal.dispose()
    })
  })

  describe('get', () => {
    it('returns undefined for unknown session', () => {
      expect(terminal.get('unknown-id')).toBeUndefined()
    })
  })

  describe('kill', () => {
    it('kills and removes session', () => {
      const session = terminal.spawn({
        agent: 'claude',
        cwd: '/test/path',
      })

      terminal.kill(session.id)

      expect(terminal.get(session.id)).toBeUndefined()
      terminal.dispose()
    })
  })

  describe('killAll', () => {
    it('kills all sessions', () => {
      terminal.spawn({ agent: 'claude', cwd: '/test' })
      terminal.spawn({ agent: 'codex', cwd: '/test' })

      expect(terminal.getAll()).toHaveLength(2)

      terminal.killAll()

      expect(terminal.getAll()).toHaveLength(0)
    })
  })
})
