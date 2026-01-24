import { ipcMain, dialog } from 'electron'
import { RegistryService } from '../services/registry'
import { ContainerService } from '../services/container'
import { ProjectConfigService } from '../services/project-config'
import { DiscoveryService } from '../services/discovery'
import { PrerequisitesService } from '../services/prerequisites'
import { SettingsService } from '../services/settings'
import { setupRegistryHandlers } from './registry-handlers'
import { setupServiceHandlers } from './service-handlers'
import { setupPrerequisitesHandlers } from './prerequisites-handlers'

export function setupIpcHandlers(): {
  registry: RegistryService
  container: ContainerService
  config: ProjectConfigService
  discovery: DiscoveryService
  prerequisites: PrerequisitesService
  settings: SettingsService
} {
  const registry = new RegistryService()
  const container = new ContainerService()
  const config = new ProjectConfigService()
  const discovery = new DiscoveryService()
  const prerequisites = new PrerequisitesService()
  const settings = new SettingsService()

  setupRegistryHandlers(registry)
  setupServiceHandlers(container, config, discovery, registry)
  setupPrerequisitesHandlers(prerequisites, settings)

  // Dialog handler for folder selection
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  return { registry, container, config, discovery, prerequisites, settings }
}
