import { ipcMain, BrowserWindow } from 'electron'
import { ProjectConfigService } from '../services/project-config'
import { DiscoveryService } from '../services/discovery'
import { RegistryService } from '../services/registry'
import { getServiceContext } from '../services/service-lookup'
import type { DiscoveryProgress } from '../../shared/types'
import { createLogger } from '../../shared/logger'

const log = createLogger('IPC')

/**
 * Sets up IPC handlers for project discovery and configuration.
 * Handles: discovery:analyze, discovery:save, config:load, service:reanalyze-env
 */
export function setupDiscoveryHandlers(
  config: ProjectConfigService,
  discovery: DiscoveryService,
  registry: RegistryService
): void {
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
}
