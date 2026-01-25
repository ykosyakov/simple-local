import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPtySession } from '../../services/agent-terminal/pty-session'

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

describe('PtySession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createPtySession', () => {
    it('creates a session with auto-generated UUID', () => {
      const session = createPtySession({
        command: 'echo',
        args: ['hello'],
      })

      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
      session.dispose()
    })

    it('starts in running state', () => {
      const session = createPtySession({
        command: 'echo',
        args: ['hello'],
      })

      expect(session.state$.getValue()).toBe('running')
      session.dispose()
    })
  })

  describe('write', () => {
    it('writes data to the PTY', async () => {
      const nodePty = await import('node-pty')
      const session = createPtySession({ command: 'bash' })

      session.write('test input')

      expect(nodePty.spawn).toHaveBeenCalled()
      const mockPty = vi.mocked(nodePty.spawn).mock.results[0].value
      expect(mockPty.write).toHaveBeenCalledWith('test input')

      session.dispose()
    })
  })

  describe('kill', () => {
    it('kills the PTY process', async () => {
      const nodePty = await import('node-pty')
      const session = createPtySession({ command: 'bash' })

      session.kill()

      const mockPty = vi.mocked(nodePty.spawn).mock.results[0].value
      expect(mockPty.kill).toHaveBeenCalled()

      session.dispose()
    })
  })

  describe('resize', () => {
    it('resizes the PTY', async () => {
      const nodePty = await import('node-pty')
      const session = createPtySession({ command: 'bash' })

      session.resize(120, 40)

      const mockPty = vi.mocked(nodePty.spawn).mock.results[0].value
      expect(mockPty.resize).toHaveBeenCalledWith(120, 40)

      session.dispose()
    })
  })
})
