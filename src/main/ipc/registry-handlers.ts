import { ipcMain } from 'electron'
import { RegistryService } from '../services/registry'

export function setupRegistryHandlers(registry: RegistryService): void {
  ipcMain.handle('registry:get', () => {
    const reg = registry.getRegistry()
    console.log('[IPC] registry:get returning', reg.projects.length, 'projects')
    return reg
  })

  ipcMain.handle('registry:addProject', (_event, path: string, name: string) => {
    console.log('[IPC] registry:addProject called:', path, name)
    const project = registry.addProject(path, name)
    console.log('[IPC] Project added with id:', project.id)
    return project
  })

  ipcMain.handle('registry:removeProject', (_event, id: string) => {
    console.log('[IPC] registry:removeProject called:', id)
    registry.removeProject(id)
  })

  ipcMain.handle('registry:updateSettings', (_event, settings) => {
    console.log('[IPC] registry:updateSettings called')
    return registry.updateSettings(settings)
  })
}
