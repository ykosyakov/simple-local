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
    console.log('[IPC] discovery:analyze called for:', projectPath)

    // Try AI discovery first, fall back to basic
    console.log('[IPC] Attempting AI discovery...')
    let result = await discovery.runAIDiscovery(projectPath)

    if (!result) {
      console.log('[IPC] AI discovery failed or timed out, falling back to basic discovery')
      result = await discovery.basicDiscovery(projectPath)
    } else {
      console.log('[IPC] AI discovery succeeded')
    }

    console.log('[IPC] Discovery complete, returning config with', result.services.length, 'services')
    return result
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
}
