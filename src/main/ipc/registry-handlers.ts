import { ipcMain } from 'electron'
import { RegistryService } from '../services/registry'
import { ProjectConfigService } from '../services/project-config'
import { allocatePort } from '../services/discovery'
import { createLogger } from '../../shared/logger'

const log = createLogger('IPC')

export interface RegistryHandlersOptions {
  onProjectRemoved?: (projectId: string) => void
  config?: ProjectConfigService
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

  ipcMain.handle('registry:reallocatePortRange', async (_event, projectId: string, newStart: number) => {
    log.info('registry:reallocatePortRange called:', projectId, newStart)

    const project = registry.reallocatePortRange(projectId, newStart)

    const config = options?.config
    if (!config) {
      throw new Error('Config service not available')
    }

    const projectConfig = await config.loadConfig(project.path)
    if (!projectConfig) {
      return null
    }

    // Re-allocate service ports from the new range
    const usedPorts = new Set<number>()
    for (const service of projectConfig.services) {
      if (service.useOriginalPort) continue
      const newPort = allocatePort(newStart, usedPorts)
      usedPorts.add(newPort)
      service.allocatedPort = newPort
      service.port = newPort
    }

    await config.saveConfig(project.path, projectConfig)

    // Regenerate devcontainer files
    for (const service of projectConfig.services) {
      const devcontainerConfig = await config.generateDevcontainerConfig(service, projectConfig.name)
      await config.saveDevcontainer(project.path, service, devcontainerConfig)
    }

    log.info('Port range reallocated and config updated')
    return projectConfig
  })
}
