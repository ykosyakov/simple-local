import path from 'path'
import { ipcMain, BrowserWindow } from 'electron'
import { ContainerService, applyContainerEnvOverrides } from '../services/container'
import { ProjectConfigService } from '../services/project-config'
import { RegistryService } from '../services/registry'
import { LogManager } from '../services/log-manager'
import { getServiceContext, getProjectContext } from '../services/service-lookup'
import { sanitizeServiceId, validatePathWithinProject } from '../services/validation'
import { ConfigPaths } from '../services/config-paths'
import { createLogger } from '../../shared/logger'

const log = createLogger('IPC')

/**
 * Check if an error is an expected lookup error (project/config/service not found).
 * These are expected when data doesn't exist and we return graceful fallbacks.
 */
function isLookupError(error: Error): boolean {
  const message = error.message.toLowerCase()
  return message.includes('not found')
}

function buildDevcontainerPath(projectPath: string, serviceId: string): string {
  if (!path.isAbsolute(projectPath)) {
    throw new Error('projectPath must be absolute')
  }

  const safeServiceId = sanitizeServiceId(serviceId)
  const devcontainerPath = ConfigPaths.devcontainerConfig(projectPath, safeServiceId)
  validatePathWithinProject(projectPath, devcontainerPath)
  return devcontainerPath
}

/**
 * Callbacks for service start operations
 */
interface ServiceStartCallbacks {
  sendLog: (data: string) => void
  sendStatus: (status: string) => void
}

/**
 * Core service start logic used by both IPC handler and exported function.
 * Handles environment interpolation, container env overrides, port killing,
 * and starting native or container services.
 */
async function startServiceCore(
  container: ContainerService,
  config: ProjectConfigService,
  registry: RegistryService,
  projectId: string,
  serviceId: string,
  callbacks: ServiceStartCallbacks,
  modeOverride?: 'native' | 'container'
): Promise<void> {
  const { project, projectConfig, service } = await getServiceContext(registry, config, projectId, serviceId)

  const effectiveMode = modeOverride ?? service.mode
  const { env: resolvedEnv, errors: interpolationErrors } = config.interpolateEnv(service.env, projectConfig.services)
  // Apply container env overrides if in container mode
  const finalEnv = effectiveMode === 'container' && service.containerEnvOverrides
    ? applyContainerEnvOverrides(resolvedEnv, service.containerEnvOverrides)
    : resolvedEnv
  const servicePath = `${project.path}/${service.path}`

  const { sendLog, sendStatus } = callbacks

  // Warn about interpolation errors in service logs
  if (interpolationErrors.length > 0) {
    sendLog(`Warning: Environment variable interpolation issues:\n${interpolationErrors.map(e => `  - ${e}`).join('\n')}\n`)
  }

  if (effectiveMode === 'native') {
    if (service.port) {
      const killed = await container.killProcessOnPortAsync(service.port)
      if (killed) {
        sendLog(`Killed existing process on port ${service.port}\n`)
      }
    }
    try {
      container.startNativeService(
        serviceId,
        service.command,
        servicePath,
        finalEnv,
        sendLog,
        sendStatus
      )
    } catch (err) {
      sendStatus('error')
      sendLog(`Failed to start: ${err instanceof Error ? err.message : 'Unknown error'}\n`)
      throw err
    }
  } else {
    const devcontainerConfigPath = buildDevcontainerPath(project.path, service.id)

    sendStatus('building')
    sendLog('══════ Building container ══════\n')

    try {
      await container.buildContainer(servicePath, devcontainerConfigPath, sendLog)
    } catch (err) {
      sendStatus('error')
      sendLog(`Build failed: ${err instanceof Error ? err.message : 'Unknown error'}\n`)
      throw err
    }

    sendStatus('starting')
    sendLog('\n══════ Starting service ══════\n')

    await container.startService(servicePath, devcontainerConfigPath, service.command, finalEnv, sendLog)
    sendStatus('running')
  }
}

export interface ServiceHandlersResult {
  getLogBuffer: (projectId: string, serviceId: string) => string[]
  startService: (projectId: string, serviceId: string, mode?: 'native' | 'container') => Promise<void>
  stopService: (projectId: string, serviceId: string) => Promise<void>
  cleanupProjectLogs: (projectId: string) => void
}

/**
 * Sets up IPC handlers for service lifecycle management.
 * Handles: service:start, service:stop, service:status, service:logs:*
 */
export function setupServiceHandlers(
  container: ContainerService,
  config: ProjectConfigService,
  registry: RegistryService,
  logManager: LogManager = new LogManager()
): ServiceHandlersResult {

  ipcMain.handle('service:start', async (event, projectId: string, serviceId: string) => {
    const callbacks: ServiceStartCallbacks = {
      sendLog: (data: string) => {
        logManager.appendLog(projectId, serviceId, data)
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.webContents.send('service:logs:data', { projectId, serviceId, data })
      },
      sendStatus: (status: string) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.webContents.send('service:status:change', { projectId, serviceId, status })
      },
    }

    await startServiceCore(container, config, registry, projectId, serviceId, callbacks)
  })

  ipcMain.handle('service:stop', async (_event, projectId: string, serviceId: string) => {
    const { projectConfig, service } = await getServiceContext(registry, config, projectId, serviceId)

    if (service.mode === 'native') {
      await container.stopNativeService(serviceId)
    } else {
      const containerName = container.getContainerName(projectConfig.name, serviceId)
      await container.stopService(containerName)
    }
  })

  ipcMain.handle('service:status', async (_event, projectId: string) => {
    try {
      const { projectConfig } = await getProjectContext(registry, config, projectId)

      const statuses = await Promise.all(
        projectConfig.services.map(async (service) => {
          const status = await container.getServiceStatus(service, projectConfig.name)
          return {
            serviceId: service.id,
            status,
            containerId: service.mode === 'container'
              ? container.getContainerName(projectConfig.name, service.id)
              : undefined,
          }
        })
      )

      return statuses
    } catch (err) {
      // Return empty array if project or config not found (matches previous behavior)
      // Log unexpected errors that aren't lookup-related
      if (err instanceof Error && !isLookupError(err)) {
        log.error('service:status unexpected error:', err)
      }
      return []
    }
  })

  ipcMain.handle('service:logs:start', async (event, projectId: string, serviceId: string) => {
    try {
      const { projectConfig } = await getProjectContext(registry, config, projectId)

      const containerName = container.getContainerName(projectConfig.name, serviceId)

      const cleanup = await container.streamLogs(containerName, (data) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.webContents.send('service:logs:data', { projectId, serviceId, data })
      })

      // registerCleanup will call existing cleanup if present
      logManager.registerCleanup(projectId, serviceId, cleanup)
    } catch (err) {
      // Silently return if project or config not found (matches previous behavior)
      // Log unexpected errors that aren't lookup-related
      if (err instanceof Error && !isLookupError(err)) {
        log.error('service:logs:start unexpected error:', err)
      }
      return
    }
  })

  ipcMain.handle('service:logs:stop', (_event, projectId: string, serviceId: string) => {
    logManager.runCleanup(projectId, serviceId)
  })

  ipcMain.handle('service:logs:get', (_event, projectId: string, serviceId: string) => {
    return logManager.getBuffer(projectId, serviceId)
  })

  ipcMain.handle('service:logs:clear', (_event, projectId: string, serviceId: string) => {
    logManager.clearBuffer(projectId, serviceId)
  })

  const getLogBuffer = (projectId: string, serviceId: string): string[] => {
    return logManager.getBuffer(projectId, serviceId)
  }

  const startService = async (projectId: string, serviceId: string, modeOverride?: 'native' | 'container'): Promise<void> => {
    const callbacks: ServiceStartCallbacks = {
      sendLog: (data: string) => {
        logManager.appendLog(projectId, serviceId, data)
      },
      sendStatus: () => {}, // No-op for programmatic usage
    }

    await startServiceCore(container, config, registry, projectId, serviceId, callbacks, modeOverride)
  }

  const stopService = async (projectId: string, serviceId: string): Promise<void> => {
    const { projectConfig, service } = await getServiceContext(registry, config, projectId, serviceId)

    if (service.mode === 'native') {
      await container.stopNativeService(serviceId)
    } else {
      const containerName = container.getContainerName(projectConfig.name, serviceId)
      await container.stopService(containerName)
    }
  }

  const cleanupProjectLogs = (projectId: string): void => {
    logManager.cleanupProject(projectId)
  }

  return { getLogBuffer, startService, stopService, cleanupProjectLogs }
}
