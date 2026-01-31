import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setupServiceHandlers,
  type ServiceHandlersResult,
} from '../ipc/service-handlers'
import { ContainerService } from '../services/container'
import { ProjectConfigService } from '../services/project-config'
import { DiscoveryService } from '../services/discovery'
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

// Mock discovery service
vi.mock('../services/discovery', () => ({
  DiscoveryService: vi.fn(),
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
  let mockDiscovery: Partial<DiscoveryService>
  let mockRegistry: Partial<RegistryService>
  let handlers: ServiceHandlersResult

  beforeEach(() => {
    vi.clearAllMocks()

    mockContainer = {
      killProcessOnPort: vi.fn(),
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
      interpolateEnv: vi.fn().mockReturnValue({}),
      generateDevcontainerConfig: vi.fn(),
      saveDevcontainer: vi.fn(),
    }

    mockDiscovery = {
      runAIDiscovery: vi.fn(),
      basicDiscovery: vi.fn(),
      runEnvAnalysis: vi.fn(),
    }

    mockRegistry = {
      getRegistry: vi.fn().mockReturnValue({ projects: [] }),
      addProject: vi.fn(),
      removeProject: vi.fn(),
    }

    handlers = setupServiceHandlers(
      mockContainer as ContainerService,
      mockConfig as ProjectConfigService,
      mockDiscovery as DiscoveryService,
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
})
