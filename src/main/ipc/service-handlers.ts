import { ipcMain, BrowserWindow } from 'electron'
import { ContainerService } from '../services/container'
import { ProjectConfigService } from '../services/project-config'
import { DiscoveryService } from '../services/discovery'
import { RegistryService } from '../services/registry'
import type { DiscoveryProgress } from '../../shared/types'

const MAX_LOG_LINES = 1000

export interface ServiceHandlersResult {
  getLogBuffer: (projectId: string, serviceId: string) => string[]
  startService: (projectId: string, serviceId: string) => Promise<void>
  stopService: (projectId: string, serviceId: string) => Promise<void>
}

export function setupServiceHandlers(
  container: ContainerService,
  config: ProjectConfigService,
  discovery: DiscoveryService,
  registry: RegistryService
): ServiceHandlersResult {
  const logCleanupFns = new Map<string, () => void>()
  const logBuffers = new Map<string, string[]>()

  ipcMain.handle('service:start', async (event, projectId: string, serviceId: string) => {
    const project = registry.getRegistry().projects.find((p) => p.id === projectId)
    if (!project) throw new Error('Project not found')

    const projectConfig = await config.loadConfig(project.path)
    if (!projectConfig) throw new Error('Project config not found')

    const service = projectConfig.services.find((s) => s.id === serviceId)
    if (!service) throw new Error('Service not found')

    const resolvedEnv = config.interpolateEnv(service.env, projectConfig.services)
    const servicePath = `${project.path}/${service.path}`

    const sendLog = (data: string) => {
      const key = `${projectId}:${serviceId}`
      const buffer = logBuffers.get(key) || []
      buffer.push(data)
      if (buffer.length > MAX_LOG_LINES) {
        buffer.splice(0, buffer.length - MAX_LOG_LINES)
      }
      logBuffers.set(key, buffer)

      const win = BrowserWindow.fromWebContents(event.sender)
      win?.webContents.send('service:logs:data', { projectId, serviceId, data })
    }

    const sendStatus = (status: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      win?.webContents.send('service:status:change', { projectId, serviceId, status })
    }

    if (service.mode === 'native') {
      if (service.port) {
        const killed = container.killProcessOnPort(service.port)
        if (killed) {
          sendLog(`Killed existing process on port ${service.port}\n`)
        }
      }
      container.startNativeService(
        serviceId,
        service.command,
        servicePath,
        resolvedEnv,
        sendLog,
        sendStatus
      )
    } else {
      const devcontainerConfigPath = `${project.path}/.simple-local/devcontainers/${service.id}.json`

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

      await container.startService(servicePath, devcontainerConfigPath, service.command, resolvedEnv)
      sendStatus('running')
    }
  })

  ipcMain.handle('service:stop', async (_event, projectId: string, serviceId: string) => {
    const project = registry.getRegistry().projects.find((p) => p.id === projectId)
    if (!project) throw new Error('Project not found')

    const projectConfig = await config.loadConfig(project.path)
    if (!projectConfig) throw new Error('Project config not found')

    const service = projectConfig.services.find((s) => s.id === serviceId)
    if (!service) throw new Error('Service not found')

    if (service.mode === 'native') {
      container.stopNativeService(serviceId)
    } else {
      const containerName = container.getContainerName(projectConfig.name, serviceId)
      await container.stopService(containerName)
    }
  })

  ipcMain.handle('service:status', async (_event, projectId: string) => {
    const project = registry.getRegistry().projects.find((p) => p.id === projectId)
    if (!project) return []

    const projectConfig = await config.loadConfig(project.path)
    if (!projectConfig) return []

    const statuses = await Promise.all(
      projectConfig.services.map(async (service) => {
        if (service.mode === 'native') {
          const isRunning = container.isNativeServiceRunning(service.id)
          return {
            serviceId: service.id,
            status: isRunning ? 'running' : 'stopped',
          }
        } else {
          const containerName = container.getContainerName(projectConfig.name, service.id)
          const status = await container.getContainerStatus(containerName)
          return {
            serviceId: service.id,
            status,
            containerId: containerName,
          }
        }
      })
    )

    return statuses
  })

  ipcMain.handle('service:logs:start', async (event, projectId: string, serviceId: string) => {
    const project = registry.getRegistry().projects.find((p) => p.id === projectId)
    if (!project) return

    const projectConfig = await config.loadConfig(project.path)
    if (!projectConfig) return

    const containerName = container.getContainerName(projectConfig.name, serviceId)
    const key = `${projectId}:${serviceId}`

    // Cleanup existing subscription
    if (logCleanupFns.has(key)) {
      logCleanupFns.get(key)?.()
    }

    const cleanup = await container.streamLogs(containerName, (data) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      win?.webContents.send('service:logs:data', { projectId, serviceId, data })
    })

    logCleanupFns.set(key, cleanup)
  })

  ipcMain.handle('service:logs:stop', (_event, projectId: string, serviceId: string) => {
    const key = `${projectId}:${serviceId}`
    logCleanupFns.get(key)?.()
    logCleanupFns.delete(key)
  })

  ipcMain.handle('service:logs:get', (_event, projectId: string, serviceId: string) => {
    const key = `${projectId}:${serviceId}`
    return logBuffers.get(key) || []
  })

  ipcMain.handle('service:logs:clear', (_event, projectId: string, serviceId: string) => {
    const key = `${projectId}:${serviceId}`
    logBuffers.delete(key)
  })

  ipcMain.handle('discovery:analyze', async (event, projectPath: string) => {
    console.log('[IPC] discovery:analyze called for:', projectPath)

    const win = BrowserWindow.fromWebContents(event.sender)
    const sendProgress = (progress: DiscoveryProgress) => {
      win?.webContents.send('discovery:progress', progress)
    }

    // Try AI discovery first, fall back to basic
    console.log('[IPC] Attempting AI discovery...')
    let result = await discovery.runAIDiscovery(projectPath, 'claude', sendProgress)

    if (!result) {
      console.log('[IPC] AI discovery failed or timed out, falling back to basic discovery')
      sendProgress({ projectPath, step: 'ai-analysis', message: 'AI discovery failed, using basic detection...' })
      result = await discovery.basicDiscovery(projectPath)
    } else {
      console.log('[IPC] AI discovery succeeded')
    }

    sendProgress({ projectPath, step: 'complete', message: 'Discovery complete' })
    console.log('[IPC] Discovery complete, returning config with', result.services.length, 'services')
    return result
  })

  // Load saved config (no discovery, just read the file)
  ipcMain.handle('config:load', async (_event, projectPath: string) => {
    console.log('[IPC] config:load called for:', projectPath)
    const projectConfig = await config.loadConfig(projectPath)
    if (!projectConfig) {
      throw new Error('No config found for project')
    }
    return projectConfig
  })

  ipcMain.handle('discovery:save', async (_event, projectPath: string, projectConfig) => {
    console.log('[IPC] discovery:save called for:', projectPath)
    console.log('[IPC] Saving config with', projectConfig.services.length, 'services')

    await config.saveConfig(projectPath, projectConfig)
    console.log('[IPC] Config saved')

    // Generate devcontainer files
    for (const service of projectConfig.services) {
      console.log('[IPC] Generating devcontainer for:', service.id)
      const devcontainerConfig = await config.generateDevcontainerConfig(service, projectConfig.name)
      await config.saveDevcontainer(projectPath, service, devcontainerConfig)
    }

    console.log('[IPC] All devcontainer files saved')
  })

  const getLogBuffer = (projectId: string, serviceId: string): string[] => {
    const key = `${projectId}:${serviceId}`
    return logBuffers.get(key) || []
  }

  const startService = async (projectId: string, serviceId: string): Promise<void> => {
    const project = registry.getRegistry().projects.find((p) => p.id === projectId)
    if (!project) throw new Error('Project not found')

    const projectConfig = await config.loadConfig(project.path)
    if (!projectConfig) throw new Error('Project config not found')

    const service = projectConfig.services.find((s) => s.id === serviceId)
    if (!service) throw new Error('Service not found')

    const resolvedEnv = config.interpolateEnv(service.env, projectConfig.services)
    const servicePath = `${project.path}/${service.path}`

    const key = `${projectId}:${serviceId}`
    const sendLog = (data: string) => {
      const buffer = logBuffers.get(key) || []
      buffer.push(data)
      if (buffer.length > MAX_LOG_LINES) {
        buffer.splice(0, buffer.length - MAX_LOG_LINES)
      }
      logBuffers.set(key, buffer)
    }

    const sendStatus = (_status: string) => {}

    if (service.mode === 'native') {
      if (service.port) {
        const killed = container.killProcessOnPort(service.port)
        if (killed) {
          sendLog(`Killed existing process on port ${service.port}\n`)
        }
      }
      container.startNativeService(
        serviceId,
        service.command,
        servicePath,
        resolvedEnv,
        sendLog,
        sendStatus
      )
    } else {
      const devcontainerConfigPath = `${project.path}/.simple-local/devcontainers/${service.id}.json`

      sendLog('══════ Building container ══════\n')
      await container.buildContainer(servicePath, devcontainerConfigPath, sendLog)

      sendLog('\n══════ Starting service ══════\n')
      await container.startService(servicePath, devcontainerConfigPath, service.command, resolvedEnv)
    }
  }

  const stopService = async (projectId: string, serviceId: string): Promise<void> => {
    const project = registry.getRegistry().projects.find((p) => p.id === projectId)
    if (!project) throw new Error('Project not found')

    const projectConfig = await config.loadConfig(project.path)
    if (!projectConfig) throw new Error('Project config not found')

    const service = projectConfig.services.find((s) => s.id === serviceId)
    if (!service) throw new Error('Service not found')

    if (service.mode === 'native') {
      container.stopNativeService(serviceId)
    } else {
      const containerName = container.getContainerName(projectConfig.name, serviceId)
      await container.stopService(containerName)
    }
  }

  return { getLogBuffer, startService, stopService }
}
