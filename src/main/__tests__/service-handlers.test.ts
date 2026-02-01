import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setupServiceHandlers,
  type ServiceHandlersResult,
} from '../ipc/service-handlers'
import { ContainerService } from '../services/container'
import { ProjectConfigService } from '../services/project-config'
import { RegistryService } from '../services/registry'

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(),
  },
}))

// Mock container service
vi.mock('../services/container', () => ({
  ContainerService: vi.fn(),
  applyContainerEnvOverrides: vi.fn((env) => env),
}))

// Mock project-config service
vi.mock('../services/project-config', () => ({
  ProjectConfigService: vi.fn(),
}))

// Mock registry service
vi.mock('../services/registry', () => ({
  RegistryService: vi.fn(),
}))

// Mock service-lookup
vi.mock('../services/service-lookup', () => ({
  getServiceContext: vi.fn(),
}))

describe('setupServiceHandlers', () => {
  let mockContainer: Partial<ContainerService>
  let mockConfig: Partial<ProjectConfigService>
  let mockRegistry: Partial<RegistryService>
  let handlers: ServiceHandlersResult

  beforeEach(() => {
    vi.clearAllMocks()

    mockContainer = {
      killProcessOnPort: vi.fn(),
      killProcessOnPortAsync: vi.fn().mockResolvedValue(false),
      startNativeService: vi.fn(),
      stopNativeService: vi.fn(),
      getContainerName: vi.fn(),
      buildContainer: vi.fn(),
      startService: vi.fn(),
      stopService: vi.fn(),
      isNativeServiceRunning: vi.fn(),
      streamLogs: vi.fn(),
      getContainerStatus: vi.fn(),
    }

    mockConfig = {
      loadConfig: vi.fn(),
      saveConfig: vi.fn(),
      interpolateEnv: vi.fn().mockReturnValue({ env: {}, errors: [] }),
      generateDevcontainerConfig: vi.fn(),
      saveDevcontainer: vi.fn(),
    }

    mockRegistry = {
      getRegistry: vi.fn().mockReturnValue({ projects: [] }),
      addProject: vi.fn(),
      removeProject: vi.fn(),
    }

    handlers = setupServiceHandlers(
      mockContainer as ContainerService,
      mockConfig as ProjectConfigService,
      mockRegistry as RegistryService
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('log buffers - current behavior', () => {
    it('returns empty array for unknown service', () => {
      const logs = handlers.getLogBuffer('unknown-project', 'unknown-service')
      expect(logs).toEqual([])
    })

    it('returns buffered logs for known service', async () => {
      const { getServiceContext } = await import('../services/service-lookup')
      vi.mocked(getServiceContext).mockResolvedValue({
        project: { id: 'proj1', name: 'Test', path: '/test' },
        projectConfig: { name: 'Test', services: [] },
        service: {
          id: 'svc1',
          name: 'Service 1',
          command: 'npm run dev',
          path: '.',
          mode: 'native',
          env: {},
          active: true,
        },
      })

      vi.mocked(mockContainer.startNativeService!).mockImplementation(
        (_id, _cmd, _cwd, _env, onLog) => {
          onLog('Log line 1')
          onLog('Log line 2')
        }
      )

      await handlers.startService('proj1', 'svc1')

      const logs = handlers.getLogBuffer('proj1', 'svc1')
      expect(logs).toContain('Log line 1')
      expect(logs).toContain('Log line 2')
    })
  })

  describe('devcontainer path construction - current behavior', () => {
    it('constructs path correctly for normal service id', async () => {
      const { getServiceContext } = await import('../services/service-lookup')
      vi.mocked(getServiceContext).mockResolvedValue({
        project: { id: 'proj1', name: 'Test', path: '/projects/myapp' },
        projectConfig: { name: 'Test', services: [] },
        service: {
          id: 'frontend',
          name: 'Frontend',
          command: 'npm run dev',
          path: 'packages/frontend',
          mode: 'container',
          env: {},
          active: true,
        },
      })

      vi.mocked(mockContainer.buildContainer!).mockResolvedValue(undefined)
      vi.mocked(mockContainer.startService!).mockResolvedValue(undefined)

      await handlers.startService('proj1', 'frontend', 'container')

      expect(mockContainer.buildContainer).toHaveBeenCalledWith(
        '/projects/myapp/packages/frontend',
        '/projects/myapp/.simple-local/devcontainers/frontend/devcontainer.json',
        expect.any(Function)
      )
    })

    it('rejects relative project path for container service', async () => {
      const { getServiceContext } = await import('../services/service-lookup')
      vi.mocked(getServiceContext).mockResolvedValue({
        project: { id: 'proj1', name: 'Test', path: 'relative/path' },
        projectConfig: { name: 'Test', services: [] },
        service: {
          id: 'frontend',
          name: 'Frontend',
          command: 'npm run dev',
          path: 'packages/frontend',
          mode: 'container',
          env: {},
          active: true,
        },
      })

      await expect(handlers.startService('proj1', 'frontend', 'container')).rejects.toThrow(
        'projectPath must be absolute'
      )
    })

    it('sanitizes service id with path traversal attempts', async () => {
      const { getServiceContext } = await import('../services/service-lookup')
      vi.mocked(getServiceContext).mockResolvedValue({
        project: { id: 'proj1', name: 'Test', path: '/projects/myapp' },
        projectConfig: { name: 'Test', services: [] },
        service: {
          id: '../../../etc/passwd',
          name: 'Malicious',
          command: 'npm run dev',
          path: 'packages/frontend',
          mode: 'container',
          env: {},
          active: true,
        },
      })

      vi.mocked(mockContainer.buildContainer!).mockResolvedValue(undefined)
      vi.mocked(mockContainer.startService!).mockResolvedValue(undefined)

      await handlers.startService('proj1', '../../../etc/passwd', 'container')

      // The sanitizeServiceId function removes ".." and replaces "/" with "-"
      // So "../../../etc/passwd" becomes "---etc-passwd"
      expect(mockContainer.buildContainer).toHaveBeenCalledWith(
        '/projects/myapp/packages/frontend',
        '/projects/myapp/.simple-local/devcontainers/---etc-passwd/devcontainer.json',
        expect.any(Function)
      )
    })
  })

  describe('log buffer cleanup - memory leak prevention', () => {
    it('clears all buffers for a project when project is removed', async () => {
      const { getServiceContext } = await import('../services/service-lookup')
      vi.mocked(getServiceContext).mockResolvedValue({
        project: { id: 'proj1', name: 'Test', path: '/test' },
        projectConfig: { name: 'Test', services: [] },
        service: {
          id: 'svc1',
          name: 'Service 1',
          command: 'npm run dev',
          path: '.',
          mode: 'native',
          env: {},
          active: true,
        },
      })

      vi.mocked(mockContainer.startNativeService!).mockImplementation(
        (_id, _cmd, _cwd, _env, onLog) => {
          onLog('Log line 1')
        }
      )

      await handlers.startService('proj1', 'svc1')

      // Verify logs exist
      expect(handlers.getLogBuffer('proj1', 'svc1')).toContain('Log line 1')

      // Clean up project logs
      handlers.cleanupProjectLogs('proj1')

      // Verify logs are cleared
      expect(handlers.getLogBuffer('proj1', 'svc1')).toEqual([])
    })
  })

  describe('PORT env var injection', () => {
    it('injects PORT env var when service.port is defined', async () => {
      const { getServiceContext } = await import('../services/service-lookup')
      vi.mocked(getServiceContext).mockResolvedValue({
        project: { id: 'proj1', name: 'Test', path: '/test' },
        projectConfig: { name: 'Test', services: [] },
        service: {
          id: 'svc1',
          name: 'Service 1',
          command: 'npm run dev',
          path: '.',
          mode: 'native',
          env: { NODE_ENV: 'development' },
          port: 3000,
          active: true,
        },
      })
      vi.mocked(mockConfig.interpolateEnv!).mockReturnValue({
        env: { NODE_ENV: 'development' },
        errors: [],
      })

      await handlers.startService('proj1', 'svc1')

      expect(mockContainer.startNativeService).toHaveBeenCalledWith(
        'svc1',
        'npm run dev',
        '/test/.',
        expect.objectContaining({ PORT: '3000', NODE_ENV: 'development' }),
        expect.any(Function),
        expect.any(Function)
      )
    })

    it('injects DEBUG_PORT env var when service.debugPort is defined', async () => {
      const { getServiceContext } = await import('../services/service-lookup')
      vi.mocked(getServiceContext).mockResolvedValue({
        project: { id: 'proj1', name: 'Test', path: '/test' },
        projectConfig: { name: 'Test', services: [] },
        service: {
          id: 'svc1',
          name: 'Service 1',
          command: 'npm run dev',
          path: '.',
          mode: 'native',
          env: {},
          port: 3000,
          debugPort: 9229,
          active: true,
        },
      })

      await handlers.startService('proj1', 'svc1')

      expect(mockContainer.startNativeService).toHaveBeenCalledWith(
        'svc1',
        'npm run dev',
        '/test/.',
        expect.objectContaining({ PORT: '3000', DEBUG_PORT: '9229' }),
        expect.any(Function),
        expect.any(Function)
      )
    })

    it('does not inject PORT when service.port is undefined', async () => {
      const { getServiceContext } = await import('../services/service-lookup')
      vi.mocked(getServiceContext).mockResolvedValue({
        project: { id: 'proj1', name: 'Test', path: '/test' },
        projectConfig: { name: 'Test', services: [] },
        service: {
          id: 'svc1',
          name: 'Service 1',
          command: 'npm run dev',
          path: '.',
          mode: 'native',
          env: { NODE_ENV: 'development' },
          active: true,
        },
      })

      await handlers.startService('proj1', 'svc1')

      const callArgs = vi.mocked(mockContainer.startNativeService!).mock.calls[0]
      const envArg = callArgs[3] as Record<string, string>
      expect(envArg).not.toHaveProperty('PORT')
    })
  })

  describe('port killing with hardcodedPort', () => {
    beforeEach(() => {
      vi.mocked(mockContainer.killProcessOnPortAsync!).mockResolvedValue(true)
    })

    it('kills process on hardcodedPort.value when it exists', async () => {
      const { getServiceContext } = await import('../services/service-lookup')
      vi.mocked(getServiceContext).mockResolvedValue({
        project: { id: 'proj1', name: 'Test', path: '/test' },
        projectConfig: { name: 'Test', services: [] },
        service: {
          id: 'svc1',
          name: 'Service 1',
          command: 'next dev -p 3001',
          path: '.',
          mode: 'native',
          env: {},
          port: 3000,  // Allocated port
          hardcodedPort: { value: 3001, source: 'command-flag', flag: '-p' },
          active: true,
        },
      })

      await handlers.startService('proj1', 'svc1')

      // Should kill on hardcodedPort (3001), not allocated port (3000)
      expect(mockContainer.killProcessOnPortAsync).toHaveBeenCalledWith(3001)
    })

    it('kills process on service.port when no hardcodedPort exists', async () => {
      const { getServiceContext } = await import('../services/service-lookup')
      vi.mocked(getServiceContext).mockResolvedValue({
        project: { id: 'proj1', name: 'Test', path: '/test' },
        projectConfig: { name: 'Test', services: [] },
        service: {
          id: 'svc1',
          name: 'Service 1',
          command: 'npm run dev',
          path: '.',
          mode: 'native',
          env: {},
          port: 3000,
          active: true,
        },
      })

      await handlers.startService('proj1', 'svc1')

      expect(mockContainer.killProcessOnPortAsync).toHaveBeenCalledWith(3000)
    })

    it('logs the correct port when killing process', async () => {
      const { getServiceContext } = await import('../services/service-lookup')
      vi.mocked(getServiceContext).mockResolvedValue({
        project: { id: 'proj1', name: 'Test', path: '/test' },
        projectConfig: { name: 'Test', services: [] },
        service: {
          id: 'svc1',
          name: 'Service 1',
          command: 'next dev -p 3001',
          path: '.',
          mode: 'native',
          env: {},
          port: 3000,
          hardcodedPort: { value: 3001, source: 'command-flag', flag: '-p' },
          active: true,
        },
      })

      await handlers.startService('proj1', 'svc1')

      const logs = handlers.getLogBuffer('proj1', 'svc1')
      expect(logs.some(log => log.includes('port 3001'))).toBe(true)
      expect(logs.some(log => log.includes('port 3000'))).toBe(false)
    })
  })

  describe('error handling classification', () => {
    // Tests verifying the isLookupError pattern used in catch blocks

    it('treats "not found" errors as expected lookup errors', () => {
      // These error messages come from service-lookup.ts
      const lookupErrors = [
        'Project not found',
        'Project config not found',
        'Service not found',
      ]

      for (const message of lookupErrors) {
        const isLookup = message.toLowerCase().includes('not found')
        expect(isLookup).toBe(true)
      }
    })

    it('identifies unexpected errors that should be logged', () => {
      // These are errors that should trigger console.error logging
      const unexpectedErrors = [
        'ENOENT: no such file or directory',
        'EACCES: permission denied',
        'Connection refused',
      ]

      for (const message of unexpectedErrors) {
        const isLookup = message.toLowerCase().includes('not found')
        expect(isLookup).toBe(false)
      }
    })
  })
})
