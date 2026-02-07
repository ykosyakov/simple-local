import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NativeProcessManager } from '../services/native-process-manager'
import { EventEmitter } from 'events'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// Helper to create a mock ChildProcess
function createMockProcess(pid = 12345) {
  const emitter = new EventEmitter()
  return Object.assign(emitter, {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: null,
    stdio: [null, null, null],
    pid,
    connected: true,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: '',
    killed: false,
    kill: vi.fn().mockReturnValue(true),
    send: vi.fn(),
    disconnect: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
  })
}

describe('NativeProcessManager', () => {
  let manager: NativeProcessManager
  let mockSpawn: ReturnType<typeof vi.fn>
  let originalProcessKill: typeof process.kill

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    manager = new NativeProcessManager()

    const childProcess = await import('child_process')
    mockSpawn = childProcess.spawn as unknown as ReturnType<typeof vi.fn>

    // Store and mock process.kill for process group operations
    originalProcessKill = process.kill
    process.kill = vi.fn().mockImplementation((_pid: number, signal?: string | number) => {
      // Default behavior: throw ESRCH (no such process) unless overridden
      if (signal === 0) {
        throw new Error('ESRCH')
      }
    }) as typeof process.kill
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    process.kill = originalProcessKill
  })

  describe('startService', () => {
    it('starts a process with detached: true for process group creation', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      const onLog = vi.fn()
      const onStatusChange = vi.fn()

      manager.startService('test-service', 'npm run dev', '/test/path', {}, onLog, onStatusChange)

      expect(mockSpawn).toHaveBeenCalledWith('npm', ['run', 'dev'], {
        cwd: '/test/path',
        env: expect.any(Object),
        shell: true,
        detached: true,
      })
      expect(onStatusChange).toHaveBeenCalledWith('starting')
    })

    it('tracks process group by PID', () => {
      const mockProc = createMockProcess(54321)
      mockSpawn.mockReturnValue(mockProc)

      // Make process group appear alive
      ;(process.kill as ReturnType<typeof vi.fn>).mockImplementation((pid: number, signal?: string | number) => {
        if (pid === -54321 && signal === 0) return true
        throw new Error('ESRCH')
      })

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      expect(manager.getProcessGroupId('test-service')).toBe(54321)
      expect(manager.isRunning('test-service')).toBe(true)
    })

    it('calls onStatusChange with "running" on spawn event', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      const onStatusChange = vi.fn()
      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), onStatusChange)

      mockProc.emit('spawn')

      expect(onStatusChange).toHaveBeenCalledWith('running')
    })

    it('logs stdout data', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      const onLog = vi.fn()
      manager.startService('test-service', 'npm run dev', '/test/path', {}, onLog, vi.fn())

      mockProc.stdout!.emit('data', Buffer.from('Hello from stdout'))

      expect(onLog).toHaveBeenCalledWith('Hello from stdout')
    })

    it('logs stderr data', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      const onLog = vi.fn()
      manager.startService('test-service', 'npm run dev', '/test/path', {}, onLog, vi.fn())

      mockProc.stderr!.emit('data', Buffer.from('Error message'))

      expect(onLog).toHaveBeenCalledWith('Error message')
    })

    it('sets status to "error" on error event', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      const onLog = vi.fn()
      const onStatusChange = vi.fn()
      manager.startService('test-service', 'npm run dev', '/test/path', {}, onLog, onStatusChange)

      mockProc.emit('error', new Error('spawn ENOENT'))

      expect(onStatusChange).toHaveBeenCalledWith('error')
      expect(onLog).toHaveBeenCalledWith('Error: spawn ENOENT')
    })
  })

  describe('process group lifecycle', () => {
    it('does not emit stopped when parent exits but children are still running', () => {
      const mockProc = createMockProcess(12345)
      mockSpawn.mockReturnValue(mockProc)

      const onLog = vi.fn()
      const onStatusChange = vi.fn()
      manager.startService('test-service', 'npm run dev', '/test/path', {}, onLog, onStatusChange)

      // Process group is still alive (child processes running)
      ;(process.kill as ReturnType<typeof vi.fn>).mockImplementation((pid: number, signal?: string | number) => {
        if (pid === -12345 && signal === 0) return true
        throw new Error('ESRCH')
      })

      // Parent process closes
      mockProc.emit('close', 0, null)

      // Should log but NOT change status to stopped
      expect(onLog).toHaveBeenCalledWith('Parent exited, child processes still running\n')
      expect(onStatusChange).not.toHaveBeenCalledWith('stopped')
      expect(manager.isRunning('test-service')).toBe(true)
    })

    it('emits stopped when entire process group exits', () => {
      const mockProc = createMockProcess(12345)
      mockSpawn.mockReturnValue(mockProc)

      const onStatusChange = vi.fn()
      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), onStatusChange)

      // Process group is dead (no processes)
      ;(process.kill as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ESRCH')
      })

      // Parent process closes
      mockProc.emit('close', 0, null)

      expect(onStatusChange).toHaveBeenCalledWith('stopped')
      expect(manager.isRunning('test-service')).toBe(false)
    })

    it('emits error when process group exits with non-zero code', () => {
      const mockProc = createMockProcess(12345)
      mockSpawn.mockReturnValue(mockProc)

      const onLog = vi.fn()
      const onStatusChange = vi.fn()
      manager.startService('test-service', 'npm run dev', '/test/path', {}, onLog, onStatusChange)

      // Process group is dead
      ;(process.kill as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ESRCH')
      })

      mockProc.emit('close', 1, null)

      expect(onStatusChange).toHaveBeenCalledWith('error')
      expect(onLog).toHaveBeenCalledWith('Process exited with code 1')
    })
  })

  describe('stopService', () => {
    it('returns false for unknown service', async () => {
      const result = await manager.stopService('unknown-service')
      expect(result).toBe(false)
    })

    it('sends SIGTERM to entire process group', async () => {
      const mockProc = createMockProcess(12345)
      mockSpawn.mockReturnValue(mockProc)

      // Make process group alive initially, then dead after SIGTERM
      let groupAlive = true
      ;(process.kill as ReturnType<typeof vi.fn>).mockImplementation((pid: number, signal?: string | number) => {
        if (signal === 0) {
          if (!groupAlive) throw new Error('ESRCH')
          return true
        }
        if (pid === -12345 && signal === 'SIGTERM') {
          groupAlive = false
        }
        return true
      })

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      const resultPromise = manager.stopService('test-service')
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(process.kill).toHaveBeenCalledWith(-12345, 'SIGTERM')
      expect(result).toBe(true)
    })

    it('sends SIGKILL after timeout if process group does not exit', async () => {
      const mockProc = createMockProcess(12345)
      mockSpawn.mockReturnValue(mockProc)

      // Process group stays alive even after SIGTERM
      ;(process.kill as ReturnType<typeof vi.fn>).mockImplementation((_pid: number, signal?: string | number) => {
        if (signal === 0) return true // Always alive
        return true
      })

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      const resultPromise = manager.stopService('test-service')

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(5001)

      expect(process.kill).toHaveBeenCalledWith(-12345, 'SIGTERM')
      expect(process.kill).toHaveBeenCalledWith(-12345, 'SIGKILL')

      const result = await resultPromise
      expect(result).toBe(true)
    })

    it('removes process from tracking after stop', async () => {
      const mockProc = createMockProcess(12345)
      mockSpawn.mockReturnValue(mockProc)

      // Process group exits immediately
      ;(process.kill as ReturnType<typeof vi.fn>).mockImplementation((_pid: number, signal?: string | number) => {
        if (signal === 0) throw new Error('ESRCH')
        return true
      })

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      await manager.stopService('test-service')

      expect(manager.isRunning('test-service')).toBe(false)
      expect(manager.getProcessGroupId('test-service')).toBeUndefined()
    })
  })

  describe('isRunning', () => {
    it('returns false for unknown service', () => {
      expect(manager.isRunning('unknown-service')).toBe(false)
    })

    it('returns true when process group is alive', () => {
      const mockProc = createMockProcess(12345)
      mockSpawn.mockReturnValue(mockProc)

      ;(process.kill as ReturnType<typeof vi.fn>).mockImplementation((pid: number, signal?: string | number) => {
        if (pid === -12345 && signal === 0) return true
        throw new Error('ESRCH')
      })

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      expect(manager.isRunning('test-service')).toBe(true)
    })

    it('returns false when process group is dead', () => {
      const mockProc = createMockProcess(12345)
      mockSpawn.mockReturnValue(mockProc)

      // Process group is dead
      ;(process.kill as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ESRCH')
      })

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      expect(manager.isRunning('test-service')).toBe(false)
    })
  })

  describe('getProcessGroupId', () => {
    it('returns undefined for unknown service', () => {
      expect(manager.getProcessGroupId('unknown-service')).toBeUndefined()
    })

    it('returns PGID for tracked service', () => {
      const mockProc = createMockProcess(54321)
      mockSpawn.mockReturnValue(mockProc)

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      expect(manager.getProcessGroupId('test-service')).toBe(54321)
    })
  })

  describe('killAllProcessGroups', () => {
    it('stops all tracked services', async () => {
      const mockProc1 = createMockProcess(11111)
      const mockProc2 = createMockProcess(22222)
      mockSpawn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2)

      // Process groups exit immediately
      ;(process.kill as ReturnType<typeof vi.fn>).mockImplementation((_pid: number, signal?: string | number) => {
        if (signal === 0) throw new Error('ESRCH')
        return true
      })

      manager.startService('service-1', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())
      manager.startService('service-2', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      await manager.killAllProcessGroups()

      expect(process.kill).toHaveBeenCalledWith(-11111, 'SIGTERM')
      expect(process.kill).toHaveBeenCalledWith(-22222, 'SIGTERM')
      expect(manager.getProcessGroupId('service-1')).toBeUndefined()
      expect(manager.getProcessGroupId('service-2')).toBeUndefined()
    })

    it('handles empty process list gracefully', async () => {
      await manager.killAllProcessGroups()
      // Should not throw
    })
  })
})
