import { ipcMain, dialog } from 'electron'
import { RegistryService } from '../services/registry'
import { ContainerService } from '../services/container'
import { ProjectConfigService } from '../services/project-config'
import { DiscoveryService } from '../services/discovery'
import { setupRegistryHandlers } from './registry-handlers'
import { setupServiceHandlers } from './service-handlers'

export function setupIpcHandlers(): {
  registry: RegistryService
  container: ContainerService
  config: ProjectConfigService
  discovery: DiscoveryService
} {
  const registry = new RegistryService()
  const container = new ContainerService()
  const config = new ProjectConfigService()
  const discovery = new DiscoveryService()

  setupRegistryHandlers(registry)
  setupServiceHandlers(container, config, discovery, registry)

  // Dialog handler for folder selection
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  return { registry, container, config, discovery }
}
