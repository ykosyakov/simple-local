import { ipcMain, BrowserWindow } from 'electron'
import { PortExtractionService, type PortExtractionResult } from '../services/port-extraction'
import { ProjectConfigService } from '../services/project-config'
import { RegistryService } from '../services/registry'
import { getServiceContext } from '../services/service-lookup'
import { createLogger } from '../../shared/logger'

const log = createLogger('IPC:PortExtraction')

/**
 * Sets up IPC handlers for port extraction.
 * Handles: ports:extract:analyze, ports:extract:apply
 */
export function setupPortExtractionHandlers(
  portExtraction: PortExtractionService,
  config: ProjectConfigService,
  registry: RegistryService
): void {
  // Analyze a service for port extraction
  ipcMain.handle(
    'ports:extract:analyze',
    async (event, projectId: string, serviceId: string): Promise<PortExtractionResult | null> => {
      log.info('ports:extract:analyze called for:', projectId, serviceId)

      const { project, service } = await getServiceContext(registry, config, projectId, serviceId)

      if (!service.hardcodedPort) {
        log.info('Service has no hardcoded port')
        return null
      }

      const win = BrowserWindow.fromWebContents(event.sender)
      const sendProgress = (message: string, log?: string) => {
        win?.webContents.send('ports:extract:progress', { serviceId, message, log })
      }

      const result = await portExtraction.analyzeService(project.path, service, sendProgress)
      return result
    }
  )

  // Apply port extraction changes
  ipcMain.handle(
    'ports:extract:apply',
    async (
      _event,
      projectId: string,
      serviceId: string,
      changes: PortExtractionResult,
      options: { commit: boolean }
    ): Promise<{ success: boolean; error?: string }> => {
      log.info('ports:extract:apply called for:', projectId, serviceId)

      const { project, service, projectConfig } = await getServiceContext(registry, config, projectId, serviceId)

      const result = await portExtraction.applyChanges(project.path, service, changes, options)

      if (result.success) {
        // Update service config to remove hardcodedPort flag
        const updatedService = { ...service, hardcodedPort: undefined }
        const updatedConfig = {
          ...projectConfig,
          services: projectConfig.services.map((s) =>
            s.id === serviceId ? updatedService : s
          ),
        }
        await config.saveConfig(project.path, updatedConfig)
        log.info('Updated service config, cleared hardcodedPort flag')
      }

      return result
    }
  )
}
