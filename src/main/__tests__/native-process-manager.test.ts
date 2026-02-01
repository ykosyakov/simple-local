import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NativeProcessManager } from '../services/native-process-manager'
import { EventEmitter } from 'events'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// Helper to create a mock ChildProcess
function createMockProcess() {
  const emitter = new EventEmitter()
  return Object.assign(emitter, {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: null,
    stdio: [null, null, null],
    pid: 12345,
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

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    manager = new NativeProcessManager()

    const childProcess = await import('child_process')
    // Cast to unknown first since spawn's return type doesn't match our mock
    mockSpawn = childProcess.spawn as unknown as ReturnType<typeof vi.fn>
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('startService', () => {
    it('starts a process and tracks it', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      const onLog = vi.fn()
      const onStatusChange = vi.fn()

      manager.startService('test-service', 'npm run dev', '/test/path', {}, onLog, onStatusChange)

      expect(mockSpawn).toHaveBeenCalledWith('npm', ['run', 'dev'], {
        cwd: '/test/path',
        env: expect.any(Object),
        shell: true,
      })
      expect(onStatusChange).toHaveBeenCalledWith('starting')
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

    it('removes process from tracking on close event', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())
      expect(manager.isRunning('test-service')).toBe(true)

      mockProc.emit('close', 0, null)

      expect(manager.isRunning('test-service')).toBe(false)
    })

    it('sets status to "stopped" on clean close', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      const onStatusChange = vi.fn()
      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), onStatusChange)

      mockProc.emit('close', 0, null)

      expect(onStatusChange).toHaveBeenCalledWith('stopped')
    })

    it('sets status to "error" on non-zero exit code', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      const onLog = vi.fn()
      const onStatusChange = vi.fn()
      manager.startService('test-service', 'npm run dev', '/test/path', {}, onLog, onStatusChange)

      mockProc.emit('close', 1, null)

      expect(onStatusChange).toHaveBeenCalledWith('error')
      expect(onLog).toHaveBeenCalledWith('Process exited with code 1')
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

  describe('stopService', () => {
    it('returns false for unknown service', async () => {
      const result = await manager.stopService('unknown-service')
      expect(result).toBe(false)
    })

    it('sends SIGTERM to process', async () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      // Simulate process exiting immediately after SIGTERM
      mockProc.kill.mockImplementation(() => {
        setImmediate(() => mockProc.emit('close', 0, 'SIGTERM'))
        return true
      })

      const resultPromise = manager.stopService('test-service')
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')
      expect(result).toBe(true)
    })

    it('returns true when process exits gracefully after SIGTERM', async () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      const resultPromise = manager.stopService('test-service')

      // Process exits gracefully
      mockProc.emit('close', 0, 'SIGTERM')

      const result = await resultPromise
      expect(result).toBe(true)
      expect(manager.isRunning('test-service')).toBe(false)
    })

    it('sends SIGKILL after timeout if process does not exit', async () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      const resultPromise = manager.stopService('test-service')

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(5001)

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')
      expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL')

      // Now process finally exits
      mockProc.emit('close', 0, 'SIGKILL')

      const result = await resultPromise
      expect(result).toBe(true)
    })

    it('removes process from tracking even if process does not respond', async () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      const resultPromise = manager.stopService('test-service')

      // Advance past timeout without process responding
      await vi.advanceTimersByTimeAsync(5001)

      // Process finally exits
      mockProc.emit('close', 0, 'SIGKILL')

      await resultPromise
      expect(manager.isRunning('test-service')).toBe(false)
    })
  })

  describe('isRunning', () => {
    it('returns false for unknown service', () => {
      expect(manager.isRunning('unknown-service')).toBe(false)
    })

    it('returns true for running service', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())

      expect(manager.isRunning('test-service')).toBe(true)
    })

    it('returns false after service stops', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())
      mockProc.emit('close', 0, null)

      expect(manager.isRunning('test-service')).toBe(false)
    })
  })

  describe('process cleanup on unexpected close', () => {
    it('auto-removes process from map when process closes unexpectedly', () => {
      const mockProc = createMockProcess()
      mockSpawn.mockReturnValue(mockProc)

      manager.startService('test-service', 'npm run dev', '/test/path', {}, vi.fn(), vi.fn())
      expect(manager.isRunning('test-service')).toBe(true)

      // Process crashes/exits unexpectedly
      mockProc.emit('close', 1, null)

      expect(manager.isRunning('test-service')).toBe(false)
    })
  })
})
