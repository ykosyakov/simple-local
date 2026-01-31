import { ipcMain } from 'electron'
import { RegistryService } from '../services/registry'
import { createLogger } from '../../shared/logger'

const log = createLogger('IPC')

export interface RegistryHandlersOptions {
  onProjectRemoved?: (projectId: string) => void
}

export function setupRegistryHandlers(
  registry: RegistryService,
  options?: RegistryHandlersOptions
): void {
  ipcMain.handle('registry:get', () => {
    const reg = registry.getRegistry()
    log.info('registry:get returning', reg.projects.length, 'projects')
    return reg
  })

  ipcMain.handle('registry:addProject', (_event, path: string, name: string) => {
    log.info('registry:addProject called:', path, name)
    const project = registry.addProject(path, name)
    log.info('Project added with id:', project.id)
    return project
  })

  ipcMain.handle('registry:removeProject', (_event, id: string) => {
    log.info('registry:removeProject called:', id)
    options?.onProjectRemoved?.(id)
    registry.removeProject(id)
  })

  ipcMain.handle('registry:updateSettings', (_event, settings) => {
    log.info('registry:updateSettings called')
    return registry.updateSettings(settings)
  })
}
