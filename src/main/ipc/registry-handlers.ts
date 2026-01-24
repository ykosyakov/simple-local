import { ipcMain } from 'electron'
import { RegistryService } from '../services/registry'

export function setupRegistryHandlers(registry: RegistryService): void {
  ipcMain.handle('registry:get', () => {
    return registry.getRegistry()
  })

  ipcMain.handle('registry:addProject', (_event, path: string, name: string) => {
    return registry.addProject(path, name)
  })

  ipcMain.handle('registry:removeProject', (_event, id: string) => {
    registry.removeProject(id)
  })

  ipcMain.handle('registry:updateSettings', (_event, settings) => {
    return registry.updateSettings(settings)
  })
}
