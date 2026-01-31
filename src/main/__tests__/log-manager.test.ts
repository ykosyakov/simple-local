import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { LogManager } from '../services/log-manager'

describe('LogManager', () => {
  let logManager: LogManager

  beforeEach(() => {
    logManager = new LogManager()
  })

  afterEach(() => {
    logManager.clear()
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('uses default MAX_LOG_LINES from constants', () => {
      // Default is 1000 from LOG_CONSTANTS
      const manager = new LogManager()
      // Add 1001 lines
      for (let i = 0; i < 1001; i++) {
        manager.appendLog('proj', 'svc', `line ${i}`)
      }
      const buffer = manager.getBuffer('proj', 'svc')
      expect(buffer.length).toBe(1000)
    })

    it('allows custom maxLines', () => {
      const manager = new LogManager(50)
      for (let i = 0; i < 60; i++) {
        manager.appendLog('proj', 'svc', `line ${i}`)
      }
      const buffer = manager.getBuffer('proj', 'svc')
      expect(buffer.length).toBe(50)
    })
  })

  describe('appendLog', () => {
    it('appends log data to buffer', () => {
      logManager.appendLog('project-1', 'service-a', 'log line 1')
      logManager.appendLog('project-1', 'service-a', 'log line 2')

      const buffer = logManager.getBuffer('project-1', 'service-a')
      expect(buffer).toEqual(['log line 1', 'log line 2'])
    })

    it('creates separate buffers for different services', () => {
      logManager.appendLog('project-1', 'service-a', 'log a')
      logManager.appendLog('project-1', 'service-b', 'log b')

      expect(logManager.getBuffer('project-1', 'service-a')).toEqual(['log a'])
      expect(logManager.getBuffer('project-1', 'service-b')).toEqual(['log b'])
    })

    it('creates separate buffers for different projects', () => {
      logManager.appendLog('project-1', 'service-a', 'log 1')
      logManager.appendLog('project-2', 'service-a', 'log 2')

      expect(logManager.getBuffer('project-1', 'service-a')).toEqual(['log 1'])
      expect(logManager.getBuffer('project-2', 'service-a')).toEqual(['log 2'])
    })

    it('trims buffer when exceeding maxLines', () => {
      const smallManager = new LogManager(5)
      for (let i = 1; i <= 7; i++) {
        smallManager.appendLog('proj', 'svc', `line ${i}`)
      }

      const buffer = smallManager.getBuffer('proj', 'svc')
      expect(buffer).toEqual(['line 3', 'line 4', 'line 5', 'line 6', 'line 7'])
    })
  })

  describe('getBuffer', () => {
    it('returns empty array for unknown service', () => {
      const buffer = logManager.getBuffer('unknown-project', 'unknown-service')
      expect(buffer).toEqual([])
    })

    it('returns the buffer for known service', () => {
      logManager.appendLog('proj', 'svc', 'data')
      expect(logManager.getBuffer('proj', 'svc')).toEqual(['data'])
    })
  })

  describe('clearBuffer', () => {
    it('clears the buffer for a specific service', () => {
      logManager.appendLog('proj', 'svc1', 'log 1')
      logManager.appendLog('proj', 'svc2', 'log 2')

      logManager.clearBuffer('proj', 'svc1')

      expect(logManager.getBuffer('proj', 'svc1')).toEqual([])
      expect(logManager.getBuffer('proj', 'svc2')).toEqual(['log 2'])
    })

    it('does nothing if buffer does not exist', () => {
      expect(() => logManager.clearBuffer('unknown', 'unknown')).not.toThrow()
    })
  })

  describe('registerCleanup', () => {
    it('registers a cleanup function', () => {
      const cleanup = vi.fn()
      logManager.registerCleanup('proj', 'svc', cleanup)

      logManager.runCleanup('proj', 'svc')
      expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it('calls existing cleanup when registering new one', () => {
      const cleanup1 = vi.fn()
      const cleanup2 = vi.fn()

      logManager.registerCleanup('proj', 'svc', cleanup1)
      logManager.registerCleanup('proj', 'svc', cleanup2)

      expect(cleanup1).toHaveBeenCalledTimes(1)
      expect(cleanup2).not.toHaveBeenCalled()

      logManager.runCleanup('proj', 'svc')
      expect(cleanup2).toHaveBeenCalledTimes(1)
    })
  })

  describe('runCleanup', () => {
    it('calls and removes cleanup function', () => {
      const cleanup = vi.fn()
      logManager.registerCleanup('proj', 'svc', cleanup)

      logManager.runCleanup('proj', 'svc')
      expect(cleanup).toHaveBeenCalledTimes(1)

      // Second call should not invoke cleanup again
      logManager.runCleanup('proj', 'svc')
      expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it('does nothing if no cleanup registered', () => {
      expect(() => logManager.runCleanup('unknown', 'unknown')).not.toThrow()
    })
  })

  describe('cleanupProject', () => {
    it('clears all buffers for a project', () => {
      logManager.appendLog('proj1', 'svc1', 'log 1-1')
      logManager.appendLog('proj1', 'svc2', 'log 1-2')
      logManager.appendLog('proj2', 'svc1', 'log 2-1')

      logManager.cleanupProject('proj1')

      expect(logManager.getBuffer('proj1', 'svc1')).toEqual([])
      expect(logManager.getBuffer('proj1', 'svc2')).toEqual([])
      expect(logManager.getBuffer('proj2', 'svc1')).toEqual(['log 2-1'])
    })

    it('calls all cleanup functions for project services', () => {
      const cleanup1 = vi.fn()
      const cleanup2 = vi.fn()
      const cleanup3 = vi.fn()

      logManager.registerCleanup('proj1', 'svc1', cleanup1)
      logManager.registerCleanup('proj1', 'svc2', cleanup2)
      logManager.registerCleanup('proj2', 'svc1', cleanup3)

      logManager.cleanupProject('proj1')

      expect(cleanup1).toHaveBeenCalledTimes(1)
      expect(cleanup2).toHaveBeenCalledTimes(1)
      expect(cleanup3).not.toHaveBeenCalled()
    })

    it('removes cleanup functions after calling them', () => {
      const cleanup = vi.fn()
      logManager.registerCleanup('proj1', 'svc1', cleanup)

      logManager.cleanupProject('proj1')
      expect(cleanup).toHaveBeenCalledTimes(1)

      // Should not be called again
      logManager.runCleanup('proj1', 'svc1')
      expect(cleanup).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear', () => {
    it('clears all buffers', () => {
      logManager.appendLog('proj1', 'svc1', 'log 1')
      logManager.appendLog('proj2', 'svc2', 'log 2')

      logManager.clear()

      expect(logManager.bufferCount).toBe(0)
      expect(logManager.getBuffer('proj1', 'svc1')).toEqual([])
      expect(logManager.getBuffer('proj2', 'svc2')).toEqual([])
    })

    it('calls all cleanup functions before clearing', () => {
      const cleanup1 = vi.fn()
      const cleanup2 = vi.fn()

      logManager.registerCleanup('proj1', 'svc1', cleanup1)
      logManager.registerCleanup('proj2', 'svc2', cleanup2)

      logManager.clear()

      expect(cleanup1).toHaveBeenCalledTimes(1)
      expect(cleanup2).toHaveBeenCalledTimes(1)
      expect(logManager.cleanupCount).toBe(0)
    })
  })

  describe('bufferCount', () => {
    it('returns 0 for empty manager', () => {
      expect(logManager.bufferCount).toBe(0)
    })

    it('returns correct count of buffers', () => {
      logManager.appendLog('proj1', 'svc1', 'log')
      logManager.appendLog('proj1', 'svc2', 'log')
      logManager.appendLog('proj2', 'svc1', 'log')

      expect(logManager.bufferCount).toBe(3)
    })
  })

  describe('cleanupCount', () => {
    it('returns 0 for empty manager', () => {
      expect(logManager.cleanupCount).toBe(0)
    })

    it('returns correct count of cleanup functions', () => {
      logManager.registerCleanup('proj1', 'svc1', () => {})
      logManager.registerCleanup('proj1', 'svc2', () => {})

      expect(logManager.cleanupCount).toBe(2)
    })
  })
})
