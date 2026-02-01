import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ContainerService } from '../services/container'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
  exec: vi.fn(),
}))

// Mock dockerode
vi.mock('dockerode', () => {
  return {
    default: class MockDocker {
      listContainers = vi.fn().mockResolvedValue([])
      getContainer = vi.fn().mockReturnValue({
        inspect: vi.fn().mockResolvedValue({ State: { Running: true } }),
        stop: vi.fn().mockResolvedValue(undefined),
        logs: vi.fn().mockResolvedValue({ on: vi.fn() }),
      })
    },
  }
})

describe('ContainerService', () => {
  let containerService: ContainerService

  beforeEach(() => {
    containerService = new ContainerService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getContainerName', () => {
    it('generates consistent container name', () => {
      const name = containerService.getContainerName('my-project', 'frontend')
      expect(name).toBe('simple-local-my-project-frontend')
    })

    it('sanitizes special characters', () => {
      const name = containerService.getContainerName('My Project!', 'Front End')
      expect(name).toBe('simple-local-my-project--front-end')
    })
  })

  describe('getContainerStatus', () => {
    it('returns stopped when container not found', async () => {
      const status = await containerService.getContainerStatus('nonexistent')
      expect(status).toBe('stopped')
    })

    it('returns stopped on Docker connection error without logging', async () => {
      const mockDocker = containerService['docker']
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(mockDocker.listContainers).mockRejectedValue(new Error('connect ECONNREFUSED'))

      const status = await containerService.getContainerStatus('test-container')

      expect(status).toBe('stopped')
      // Should not log expected Docker connection errors
      expect(consoleSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('returns stopped and logs unexpected errors', async () => {
      const mockDocker = containerService['docker']
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(mockDocker.listContainers).mockRejectedValue(new Error('Unexpected database error'))

      const status = await containerService.getContainerStatus('test-container')

      expect(status).toBe('stopped')
      // Should log unexpected errors
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Container]'),
        expect.stringContaining('Unexpected database error')
      )
      consoleSpy.mockRestore()
    })

    it('handles Docker ENOENT error silently', async () => {
      const mockDocker = containerService['docker']
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(mockDocker.listContainers).mockRejectedValue(new Error('ENOENT: no such file /var/run/docker.sock'))

      const status = await containerService.getContainerStatus('test-container')

      expect(status).toBe('stopped')
      expect(consoleSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('getContainerStatus - caching', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns cached result within TTL (2s)', async () => {
      const mockDocker = containerService['docker']
      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        { Names: ['/test-container'], State: 'running' } as any,
      ])

      await containerService.getContainerStatus('test-container')
      await containerService.getContainerStatus('test-container')

      expect(mockDocker.listContainers).toHaveBeenCalledTimes(1)
    })

    it('refreshes after TTL expires', async () => {
      const mockDocker = containerService['docker']
      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        { Names: ['/test-container'], State: 'running' } as any,
      ])

      await containerService.getContainerStatus('test-container')
      vi.advanceTimersByTime(2100)
      await containerService.getContainerStatus('test-container')

      expect(mockDocker.listContainers).toHaveBeenCalledTimes(2)
    })

    it('shares cache across different containers', async () => {
      const mockDocker = containerService['docker']
      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        { Names: ['/container-1'], State: 'running' } as any,
        { Names: ['/container-2'], State: 'stopped' } as any,
      ])

      await containerService.getContainerStatus('container-1')
      await containerService.getContainerStatus('container-2')

      expect(mockDocker.listContainers).toHaveBeenCalledTimes(1)
    })

    it('invalidates cache manually', async () => {
      const mockDocker = containerService['docker']
      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        { Names: ['/test-container'], State: 'running' } as any,
      ])

      await containerService.getContainerStatus('test-container')
      containerService.invalidateStatusCache()
      await containerService.getContainerStatus('test-container')

      expect(mockDocker.listContainers).toHaveBeenCalledTimes(2)
    })
  })

  describe('buildDevcontainerCommand', () => {
    it('builds correct devcontainer up command', () => {
      const cmd = containerService.buildDevcontainerCommand('up', '/path/to/project')
      expect(cmd).toContain('devcontainer')
      expect(cmd).toContain('up')
      expect(cmd).toContain('--workspace-folder')
    })

    it('builds correct devcontainer exec command', () => {
      const cmd = containerService.buildDevcontainerCommand('exec', '/path/to/project', 'npm run dev')
      expect(cmd).toContain('exec')
      expect(cmd).toContain('npm run dev')
    })
  })

  describe('startNativeService', () => {
    it('spawns process with correct cwd and env', async () => {
      const { spawn } = await import('child_process')
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      const onLog = vi.fn()
      const onStatusChange = vi.fn()

      containerService.startNativeService(
        'test-service',
        'npm run dev',
        '/path/to/service',
        { NODE_ENV: 'development' },
        onLog,
        onStatusChange
      )

      expect(spawn).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev'],
        expect.objectContaining({
          cwd: '/path/to/service',
          env: expect.objectContaining({ NODE_ENV: 'development' }),
          shell: true,
        })
      )
      expect(onStatusChange).toHaveBeenCalledWith('starting')
    })

    it('splits command by spaces', async () => {
      const { spawn } = await import('child_process')
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      containerService.startNativeService(
        'test-service',
        'npm run dev',
        '/path',
        {},
        vi.fn(),
        vi.fn()
      )

      expect(spawn).toHaveBeenCalledWith('npm', ['run', 'dev'], expect.any(Object))
    })

    it('handles commands with multiple arguments', async () => {
      const { spawn } = await import('child_process')
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      containerService.startNativeService(
        'test-service',
        'npm run dev --port 3000',
        '/path',
        {},
        vi.fn(),
        vi.fn()
      )

      expect(spawn).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev', '--port', '3000'],
        expect.any(Object)
      )
    })

    it('calls onStatusChange with starting immediately', async () => {
      const { spawn } = await import('child_process')
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      const onStatusChange = vi.fn()

      containerService.startNativeService(
        'test-service',
        'npm run dev',
        '/path',
        {},
        vi.fn(),
        onStatusChange
      )

      expect(onStatusChange).toHaveBeenCalledWith('starting')
    })

    it('calls onStatusChange with running on spawn event', async () => {
      const { spawn } = await import('child_process')
      let spawnCallback: () => void = () => {}
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'spawn') spawnCallback = cb
        }),
        pid: 12345,
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      const onStatusChange = vi.fn()

      containerService.startNativeService(
        'test-service',
        'npm run dev',
        '/path',
        {},
        vi.fn(),
        onStatusChange
      )

      spawnCallback()

      expect(onStatusChange).toHaveBeenCalledWith('running')
    })

    it('forwards stdout data to onLog', async () => {
      const { spawn } = await import('child_process')
      let stdoutCallback: (data: Buffer) => void = () => {}
      const mockProcess = {
        stdout: {
          on: vi.fn((event, cb) => {
            if (event === 'data') stdoutCallback = cb
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      const onLog = vi.fn()

      containerService.startNativeService(
        'test-service',
        'npm run dev',
        '/path',
        {},
        onLog,
        vi.fn()
      )

      stdoutCallback(Buffer.from('Hello world'))

      expect(onLog).toHaveBeenCalledWith('Hello world')
    })
  })

  describe('killProcessOnPort - current behavior', () => {
    it('returns true when process is killed', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('lsof')) return '12345' as any
        return '' as any
      })

      const result = containerService.killProcessOnPort(3000)

      expect(result).toBe(true)
      expect(execSync).toHaveBeenCalledWith('lsof -ti tcp:3000', { encoding: 'utf-8' })
      expect(execSync).toHaveBeenCalledWith('kill -9 12345')
    })

    it('returns false when no process on port', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('no process')
      })

      const result = containerService.killProcessOnPort(3000)

      expect(result).toBe(false)
    })

    it('handles multiple PIDs on same port', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('lsof')) return '12345\n67890' as any
        return '' as any
      })

      const result = containerService.killProcessOnPort(3000)

      expect(result).toBe(true)
      expect(execSync).toHaveBeenCalledWith('kill -9 12345')
      expect(execSync).toHaveBeenCalledWith('kill -9 67890')
    })

    it('continues killing remaining PIDs if one kill fails', async () => {
      const { execSync } = await import('child_process')
      let killCount = 0
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('lsof')) return '12345\n67890' as any
        if (cmd.includes('kill')) {
          killCount++
          if (killCount === 1) throw new Error('process already exited')
        }
        return '' as any
      })

      const result = containerService.killProcessOnPort(3000)

      expect(result).toBe(true)
      expect(execSync).toHaveBeenCalledWith('kill -9 12345')
      expect(execSync).toHaveBeenCalledWith('kill -9 67890')
    })
  })

  describe('killProcessOnPort - security', () => {
    it('rejects non-numeric port values', async () => {
      expect(() => containerService.killProcessOnPort('5000; rm -rf /' as any)).toThrow(
        'Port must be an integer'
      )
    })

    it('rejects port values outside valid range - negative', async () => {
      expect(() => containerService.killProcessOnPort(-1)).toThrow(
        'Port must be between 1 and 65535'
      )
    })

    it('rejects port values outside valid range - too high', async () => {
      expect(() => containerService.killProcessOnPort(70000)).toThrow(
        'Port must be between 1 and 65535'
      )
    })

    it('rejects non-integer port values', async () => {
      expect(() => containerService.killProcessOnPort(3000.5)).toThrow('Port must be an integer')
    })

    it('rejects NaN port values', async () => {
      expect(() => containerService.killProcessOnPort(NaN)).toThrow('Port must be an integer')
    })
  })

  describe('killProcessOnPortAsync', () => {
    it('returns promise resolving to true when process killed', async () => {
      const { exec } = await import('child_process')
      vi.mocked(exec).mockImplementation(((cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
        if (cmd.includes('lsof')) {
          callback(null, { stdout: '12345\n', stderr: '' })
        } else {
          callback(null, { stdout: '', stderr: '' })
        }
        return {} as any
      }) as any)

      const result = await containerService.killProcessOnPortAsync(3000)

      expect(result).toBe(true)
      expect(exec).toHaveBeenCalledWith('lsof -ti tcp:3000', expect.any(Function))
    })

    it('returns false when no process on port', async () => {
      const { exec } = await import('child_process')
      vi.mocked(exec).mockImplementation(((_cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
        callback(new Error('no process'), { stdout: '', stderr: '' })
        return {} as any
      }) as any)

      const result = await containerService.killProcessOnPortAsync(3000)

      expect(result).toBe(false)
    })

    it('does not block main thread (uses async exec)', async () => {
      const { exec, execSync } = await import('child_process')
      vi.mocked(exec).mockImplementation(((_cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
        callback(new Error('no process'), { stdout: '', stderr: '' })
        return {} as any
      }) as any)

      await containerService.killProcessOnPortAsync(3000)

      expect(execSync).not.toHaveBeenCalled()
    })

    it('handles multiple PIDs on same port', async () => {
      const { exec } = await import('child_process')
      const calls: string[] = []
      vi.mocked(exec).mockImplementation(((cmd: string, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
        calls.push(cmd)
        if (cmd.includes('lsof')) {
          callback(null, { stdout: '12345\n67890\n', stderr: '' })
        } else {
          callback(null, { stdout: '', stderr: '' })
        }
        return {} as any
      }) as any)

      const result = await containerService.killProcessOnPortAsync(3000)

      expect(result).toBe(true)
      expect(calls).toContain('kill -9 12345')
      expect(calls).toContain('kill -9 67890')
    })

    it('validates port parameter', async () => {
      await expect(containerService.killProcessOnPortAsync(-1)).rejects.toThrow(
        'Port must be between 1 and 65535'
      )
    })
  })

  describe('stopNativeService', () => {
    it('stops a running native service', async () => {
      const { spawn } = await import('child_process')
      const mockKill = vi.fn().mockReturnValue(true)
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: mockKill,
        pid: 12345,
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      // Start a service first
      containerService.startNativeService(
        'test-service',
        'npm run dev',
        '/path',
        {},
        vi.fn(),
        vi.fn()
      )

      // Now stop it
      const result = containerService.stopNativeService('test-service')

      expect(result).toBe(true)
      expect(mockKill).toHaveBeenCalledWith('SIGTERM')
    })

    it('returns false if no process found', () => {
      const result = containerService.stopNativeService('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('buildContainer', () => {
    it('runs devcontainer build with correct args', async () => {
      const { spawn } = await import('child_process')
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 10)
        }),
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      const onLog = vi.fn()
      await containerService.buildContainer('/path/to/workspace', '/path/to/config.json', onLog)

      expect(spawn).toHaveBeenCalledWith(
        'npx',
        ['devcontainer', 'build', '--workspace-folder', '/path/to/workspace', '--config', '/path/to/config.json'],
        expect.any(Object)
      )
    })

    it('forwards stdout to onLog callback', async () => {
      const { spawn } = await import('child_process')
      const callbacks: Record<string, (data: Buffer) => void> = {}
      const mockProcess = {
        stdout: {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') callbacks.stdout = cb
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (code: number) => void) => {
          if (event === 'close') setTimeout(() => cb(0), 10)
        }),
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      const onLog = vi.fn()
      const promise = containerService.buildContainer('/path', '/config.json', onLog)

      callbacks.stdout?.(Buffer.from('build output'))
      await promise

      expect(onLog).toHaveBeenCalledWith('build output')
    })

    it('forwards stderr to onLog callback', async () => {
      const { spawn } = await import('child_process')
      const callbacks: Record<string, (data: Buffer) => void> = {}
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') callbacks.stderr = cb
          }),
        },
        on: vi.fn((event: string, cb: (code: number) => void) => {
          if (event === 'close') setTimeout(() => cb(0), 10)
        }),
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      const onLog = vi.fn()
      const promise = containerService.buildContainer('/path', '/config.json', onLog)

      callbacks.stderr?.(Buffer.from('warning message'))
      await promise

      expect(onLog).toHaveBeenCalledWith('warning message')
    })

    it('rejects on non-zero exit code', async () => {
      const { spawn } = await import('child_process')
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(1), 10)
        }),
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      await expect(
        containerService.buildContainer('/path', '/config.json', vi.fn())
      ).rejects.toThrow('devcontainer build failed with code 1')
    })

    it('rejects on process error', async () => {
      const { spawn } = await import('child_process')
      const callbacks: Record<string, (err: Error) => void> = {}
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (err: Error) => void) => {
          if (event === 'error') callbacks.error = cb
        }),
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      const promise = containerService.buildContainer('/path', '/config.json', vi.fn())
      callbacks.error?.(new Error('spawn failed'))

      await expect(promise).rejects.toThrow('spawn failed')
    })
  })

  describe('startService', () => {
    it('runs devcontainer up with correct args', async () => {
      const { spawn } = await import('child_process')
      const mockUpProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 10)
        }),
      }
      const mockExecProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      }
      vi.mocked(spawn)
        .mockReturnValueOnce(mockUpProcess as any)
        .mockReturnValueOnce(mockExecProcess as any)

      await containerService.startService(
        '/workspace',
        '/config.json',
        'npm run dev',
        { NODE_ENV: 'dev' }
      )

      expect(spawn).toHaveBeenNthCalledWith(
        1,
        'npx',
        ['devcontainer', 'up', '--workspace-folder', '/workspace', '--config', '/config.json'],
        expect.objectContaining({
          env: expect.objectContaining({ NODE_ENV: 'dev' }),
          shell: true,
        })
      )
    })

    it('runs devcontainer exec after up completes', async () => {
      const { spawn } = await import('child_process')
      const mockUpProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 10)
        }),
      }
      const mockExecProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      }
      vi.mocked(spawn)
        .mockReturnValueOnce(mockUpProcess as any)
        .mockReturnValueOnce(mockExecProcess as any)

      await containerService.startService(
        '/workspace',
        '/config.json',
        'npm run dev',
        {}
      )

      expect(spawn).toHaveBeenNthCalledWith(
        2,
        'npx',
        ['devcontainer', 'exec', '--workspace-folder', '/workspace', '--config', '/config.json', 'npm run dev'],
        expect.any(Object)
      )
    })

    it('forwards stdout to onLog callback and emits log event', async () => {
      const { spawn } = await import('child_process')
      const callbacks: Record<string, (data: Buffer) => void> = {}
      const mockUpProcess = {
        stdout: {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') callbacks.stdout = cb
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (code: number) => void) => {
          if (event === 'close') setTimeout(() => cb(0), 10)
        }),
      }
      const mockExecProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      }
      vi.mocked(spawn)
        .mockReturnValueOnce(mockUpProcess as any)
        .mockReturnValueOnce(mockExecProcess as any)

      const onLog = vi.fn()
      const logEmitted = vi.fn()
      containerService.on('log', logEmitted)

      const promise = containerService.startService('/workspace', '/config.json', 'npm run dev', {}, onLog)
      callbacks.stdout?.(Buffer.from('starting up'))
      await promise

      expect(onLog).toHaveBeenCalledWith('starting up')
      expect(logEmitted).toHaveBeenCalledWith('starting up')
    })

    it('rejects if devcontainer up fails', async () => {
      const { spawn } = await import('child_process')
      const eventHandlers: Record<string, (arg: unknown) => void> = {}
      const mockUpProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (arg: unknown) => void) => {
          eventHandlers[event] = cb
          if (event === 'close') setTimeout(() => cb(1), 10)
        }),
      }
      vi.mocked(spawn).mockReturnValue(mockUpProcess as any)

      await expect(
        containerService.startService('/workspace', '/config.json', 'npm run dev', {})
      ).rejects.toThrow('devcontainer up failed with code 1')
    })

    it('invalidates status cache after starting service', async () => {
      const { spawn } = await import('child_process')
      const mockUpProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 10)
        }),
      }
      const mockExecProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      }
      vi.mocked(spawn)
        .mockReturnValueOnce(mockUpProcess as any)
        .mockReturnValueOnce(mockExecProcess as any)

      const invalidateSpy = vi.spyOn(containerService, 'invalidateStatusCache')

      await containerService.startService('/workspace', '/config.json', 'npm run dev', {})

      expect(invalidateSpy).toHaveBeenCalled()
    })
  })

  describe('streamLogs', () => {
    it('returns no-op cleanup when container does not exist', async () => {
      const mockDocker = containerService['docker']
      vi.mocked(mockDocker.getContainer).mockReturnValue({
        inspect: vi.fn().mockRejectedValue(new Error('no such container')),
        logs: vi.fn(),
      } as any)

      const onLog = vi.fn()
      const cleanup = await containerService.streamLogs('nonexistent', onLog)

      expect(cleanup).toBeInstanceOf(Function)
      cleanup()
      expect(onLog).not.toHaveBeenCalled()
    })
  })

  describe('getServiceStatus', () => {
    it('returns running for native service when process is running', async () => {
      const { spawn } = await import('child_process')
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      }
      vi.mocked(spawn).mockReturnValue(mockProcess as any)

      // Start a native service first
      containerService.startNativeService(
        'test-service',
        'npm run dev',
        '/path',
        {},
        vi.fn(),
        vi.fn()
      )

      const service = {
        id: 'test-service',
        name: 'Test Service',
        mode: 'native' as const,
        command: 'npm run dev',
        path: '.',
        port: 3000,
        env: {},
        active: true,
      }

      const status = await containerService.getServiceStatus(service, 'test-project')
      expect(status).toBe('running')
    })

    it('returns stopped for native service when process is not running', async () => {
      const service = {
        id: 'nonexistent-service',
        name: 'Test Service',
        mode: 'native' as const,
        command: 'npm run dev',
        path: '.',
        port: 3000,
        env: {},
        active: true,
      }

      const status = await containerService.getServiceStatus(service, 'test-project')
      expect(status).toBe('stopped')
    })

    it('returns running for container service when container is running', async () => {
      const mockDocker = containerService['docker']
      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        { Names: ['/simple-local-test-project-backend'], State: 'running' } as any,
      ])

      const service = {
        id: 'backend',
        name: 'Backend Service',
        mode: 'container' as const,
        command: 'npm start',
        path: '.',
        port: 4000,
        env: {},
        active: true,
      }

      const status = await containerService.getServiceStatus(service, 'test-project')
      expect(status).toBe('running')
    })

    it('returns stopped for container service when container does not exist', async () => {
      const mockDocker = containerService['docker']
      vi.mocked(mockDocker.listContainers).mockResolvedValue([])

      const service = {
        id: 'backend',
        name: 'Backend Service',
        mode: 'container' as const,
        command: 'npm start',
        path: '.',
        port: 4000,
        env: {},
        active: true,
      }

      const status = await containerService.getServiceStatus(service, 'test-project')
      expect(status).toBe('stopped')
    })

    it('returns starting for container service when container is starting', async () => {
      const mockDocker = containerService['docker']
      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        { Names: ['/simple-local-test-project-api'], State: 'created' } as any,
      ])

      const service = {
        id: 'api',
        name: 'API Service',
        mode: 'container' as const,
        command: 'npm start',
        path: '.',
        port: 5000,
        env: {},
        active: true,
      }

      const status = await containerService.getServiceStatus(service, 'test-project')
      expect(status).toBe('starting')
    })
  })
})
