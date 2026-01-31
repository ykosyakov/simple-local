import { ipcMain, BrowserWindow } from 'electron'
import { ContainerService, applyContainerEnvOverrides } from '../services/container'
import { ProjectConfigService } from '../services/project-config'
import { DiscoveryService } from '../services/discovery'
import { RegistryService } from '../services/registry'
import { LogManager } from '../services/log-manager'
import { getServiceContext, getProjectContext } from '../services/service-lookup'
import { sanitizeServiceId, validatePathWithinProject } from '../services/validation'
import type { DiscoveryProgress } from '../../shared/types'
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
  const safeServiceId = sanitizeServiceId(serviceId)
  const devcontainerPath = `${projectPath}/.simple-local/devcontainers/${safeServiceId}/devcontainer.json`
  validatePathWithinProject(projectPath, devcontainerPath)
  return devcontainerPath
}

export interface ServiceHandlersResult {
  getLogBuffer: (projectId: string, serviceId: string) => string[]
  startService: (projectId: string, serviceId: string, mode?: 'native' | 'container') => Promise<void>
  stopService: (projectId: string, serviceId: string) => Promise<void>
  cleanupProjectLogs: (projectId: string) => void
}

export function setupServiceHandlers(
  container: ContainerService,
  config: ProjectConfigService,
  discovery: DiscoveryService,
  registry: RegistryService,
  logManager: LogManager = new LogManager()
): ServiceHandlersResult {

  ipcMain.handle('service:start', async (event, projectId: string, serviceId: string) => {
    const { project, projectConfig, service } = await getServiceContext(registry, config, projectId, serviceId)

    const { env: resolvedEnv, errors: interpolationErrors } = config.interpolateEnv(service.env, projectConfig.services)
    // Apply container env overrides if in container mode
    const finalEnv = service.mode === 'container' && service.containerEnvOverrides
      ? applyContainerEnvOverrides(resolvedEnv, service.containerEnvOverrides)
      : resolvedEnv
    const servicePath = `${project.path}/${service.path}`

    const sendLog = (data: string) => {
      logManager.appendLog(projectId, serviceId, data)

      const win = BrowserWindow.fromWebContents(event.sender)
      win?.webContents.send('service:logs:data', { projectId, serviceId, data })
    }

    // Warn about interpolation errors in service logs
    if (interpolationErrors.length > 0) {
      sendLog(`Warning: Environment variable interpolation issues:\n${interpolationErrors.map(e => `  - ${e}`).join('\n')}\n`)
    }

    const sendStatus = (status: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      win?.webContents.send('service:status:change', { projectId, serviceId, status })
    }

    if (service.mode === 'native') {
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
  })

  ipcMain.handle('service:stop', async (_event, projectId: string, serviceId: string) => {
    const { projectConfig, service } = await getServiceContext(registry, config, projectId, serviceId)

    if (service.mode === 'native') {
      container.stopNativeService(serviceId)
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

  ipcMain.handle('discovery:analyze', async (event, projectPath: string) => {
    log.info('discovery:analyze called for:', projectPath)

    const win = BrowserWindow.fromWebContents(event.sender)
    const sendProgress = (progress: DiscoveryProgress) => {
      win?.webContents.send('discovery:progress', progress)
    }

    // Try AI discovery first, fall back to basic
    log.info('Attempting AI discovery...')
    let result = await discovery.runAIDiscovery(projectPath, 'claude', sendProgress)

    if (!result) {
      log.info('AI discovery failed or timed out, falling back to basic discovery')
      sendProgress({ projectPath, step: 'ai-analysis', message: 'AI discovery failed, using basic detection...' })
      result = await discovery.basicDiscovery(projectPath)
    } else {
      log.info('AI discovery succeeded')
    }

    sendProgress({ projectPath, step: 'complete', message: 'Discovery complete' })
    log.info('Discovery complete, returning config with', result.services.length, 'services')
    return result
  })

  // Load saved config (no discovery, just read the file)
  ipcMain.handle('config:load', async (_event, projectPath: string) => {
    log.info('config:load called for:', projectPath)
    const projectConfig = await config.loadConfig(projectPath)
    if (!projectConfig) {
      throw new Error('No config found for project')
    }
    return projectConfig
  })

  ipcMain.handle('discovery:save', async (_event, projectPath: string, projectConfig) => {
    log.info('discovery:save called for:', projectPath)
    log.info('Saving config with', projectConfig.services.length, 'services')

    await config.saveConfig(projectPath, projectConfig)
    log.info('Config saved')

    // Generate devcontainer files
    for (const service of projectConfig.services) {
      log.info('Generating devcontainer for:', service.id)
      const devcontainerConfig = await config.generateDevcontainerConfig(service, projectConfig.name)
      await config.saveDevcontainer(projectPath, service, devcontainerConfig)
    }

    log.info('All devcontainer files saved')
  })

  ipcMain.handle('service:reanalyze-env', async (event, projectId: string, serviceId: string) => {
    log.info('service:reanalyze-env called for:', projectId, serviceId)

    const { project, service } = await getServiceContext(registry, config, projectId, serviceId)

    const win = BrowserWindow.fromWebContents(event.sender)
    const sendProgress = (progress: DiscoveryProgress) => {
      win?.webContents.send('discovery:progress', progress)
    }

    const overrides = await discovery.runEnvAnalysis(
      project.path,
      service,
      'claude',
      sendProgress
    )

    return overrides
  })

  const getLogBuffer = (projectId: string, serviceId: string): string[] => {
    return logManager.getBuffer(projectId, serviceId)
  }

  const startService = async (projectId: string, serviceId: string, modeOverride?: 'native' | 'container'): Promise<void> => {
    const { project, projectConfig, service } = await getServiceContext(registry, config, projectId, serviceId)

    const { env: resolvedEnv, errors: interpolationErrors } = config.interpolateEnv(service.env, projectConfig.services)
    const servicePath = `${project.path}/${service.path}`
    const effectiveMode = modeOverride || service.mode
    // Apply container env overrides if in container mode
    const finalEnv = effectiveMode === 'container' && service.containerEnvOverrides
      ? applyContainerEnvOverrides(resolvedEnv, service.containerEnvOverrides)
      : resolvedEnv

    const sendLog = (data: string) => {
      logManager.appendLog(projectId, serviceId, data)
    }

    // Warn about interpolation errors in service logs
    if (interpolationErrors.length > 0) {
      sendLog(`Warning: Environment variable interpolation issues:\n${interpolationErrors.map(e => `  - ${e}`).join('\n')}\n`)
    }

    const sendStatus = (_status: string) => {}

    if (effectiveMode === 'native') {
      if (service.port) {
        const killed = await container.killProcessOnPortAsync(service.port)
        if (killed) {
          sendLog(`Killed existing process on port ${service.port}\n`)
        }
      }
      container.startNativeService(
        serviceId,
        service.command,
        servicePath,
        finalEnv,
        sendLog,
        sendStatus
      )
    } else {
      const devcontainerConfigPath = buildDevcontainerPath(project.path, service.id)

      sendLog('══════ Building container ══════\n')
      await container.buildContainer(servicePath, devcontainerConfigPath, sendLog)

      sendLog('\n══════ Starting service ══════\n')
      await container.startService(servicePath, devcontainerConfigPath, service.command, finalEnv, sendLog)
    }
  }

  const stopService = async (projectId: string, serviceId: string): Promise<void> => {
    const { projectConfig, service } = await getServiceContext(registry, config, projectId, serviceId)

    if (service.mode === 'native') {
      container.stopNativeService(serviceId)
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
