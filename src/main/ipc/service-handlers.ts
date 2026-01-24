import { ipcMain, BrowserWindow } from 'electron'
import { ContainerService } from '../services/container'
import { ProjectConfigService } from '../services/project-config'
import { DiscoveryService } from '../services/discovery'
import { RegistryService } from '../services/registry'

export function setupServiceHandlers(
  container: ContainerService,
  config: ProjectConfigService,
  discovery: DiscoveryService,
  registry: RegistryService
): void {
  const logCleanupFns = new Map<string, () => void>()

  ipcMain.handle('service:start', async (_event, projectId: string, serviceId: string) => {
    const project = registry.getRegistry().projects.find((p) => p.id === projectId)
    if (!project) throw new Error('Project not found')

    const projectConfig = await config.loadConfig(project.path)
    if (!projectConfig) throw new Error('Project config not found')

    const service = projectConfig.services.find((s) => s.id === serviceId)
    if (!service) throw new Error('Service not found')

    const resolvedEnv = config.interpolateEnv(service.env, projectConfig.services)

    await container.startService(
      `${project.path}/${service.path}`,
      service.command,
      resolvedEnv
    )
  })

  ipcMain.handle('service:stop', async (_event, projectId: string, serviceId: string) => {
    const project = registry.getRegistry().projects.find((p) => p.id === projectId)
    if (!project) throw new Error('Project not found')

    const projectConfig = await config.loadConfig(project.path)
    if (!projectConfig) throw new Error('Project config not found')

    const containerName = container.getContainerName(projectConfig.name, serviceId)
    await container.stopService(containerName)
  })

  ipcMain.handle('service:status', async (_event, projectId: string) => {
    const project = registry.getRegistry().projects.find((p) => p.id === projectId)
    if (!project) return []

    const projectConfig = await config.loadConfig(project.path)
    if (!projectConfig) return []

    const statuses = await Promise.all(
      projectConfig.services.map(async (service) => {
        const containerName = container.getContainerName(projectConfig.name, service.id)
        const status = await container.getContainerStatus(containerName)
        return {
          serviceId: service.id,
          status,
          containerId: containerName,
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

  ipcMain.handle('discovery:analyze', async (_event, projectPath: string) => {
    // Try AI discovery first, fall back to basic
    let result = await discovery.runAIDiscovery(projectPath)

    if (!result) {
      result = await discovery.basicDiscovery(projectPath)
    }

    return result
  })

  ipcMain.handle('discovery:save', async (_event, projectPath: string, projectConfig) => {
    await config.saveConfig(projectPath, projectConfig)

    // Generate devcontainer files
    for (const service of projectConfig.services) {
      const devcontainerConfig = await config.generateDevcontainerConfig(service, projectConfig.name)
      await config.saveDevcontainer(projectPath, service, devcontainerConfig)
    }
  })
}
