import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ContainerService } from '../services/container'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
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

  describe('getContainerName', () => {
    it('generates consistent container name', () => {
      const name = containerService.getContainerName('my-project', 'frontend')
      expect(name).toBe('simple-run-my-project-frontend')
    })

    it('sanitizes special characters', () => {
      const name = containerService.getContainerName('My Project!', 'Front End')
      expect(name).toBe('simple-run-my-project--front-end')
    })
  })

  describe('getContainerStatus', () => {
    it('returns stopped when container not found', async () => {
      const status = await containerService.getContainerStatus('nonexistent')
      expect(status).toBe('stopped')
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
  })

  describe('stopNativeService', () => {
    it('kills the native process', () => {
      const mockProcess = {
        kill: vi.fn().mockReturnValue(true),
      }
      containerService['nativeProcesses'].set('test-service', mockProcess as any)

      const result = containerService.stopNativeService('test-service')

      expect(result).toBe(true)
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('returns false if no process found', () => {
      const result = containerService.stopNativeService('nonexistent')
      expect(result).toBe(false)
    })
  })
})
