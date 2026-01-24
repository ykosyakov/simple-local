import { ipcMain } from 'electron'
import type { PrerequisitesService } from '../services/prerequisites'
import type { SettingsService } from '../services/settings'
import type { ContainerService } from '../services/container'
import type { AppSettings } from '../../shared/types'

export function setupPrerequisitesHandlers(
  prerequisites: PrerequisitesService,
  settingsService: SettingsService,
  container: ContainerService
): void {
  ipcMain.handle('prerequisites:check', async () => {
    return prerequisites.checkAll()
  })

  ipcMain.handle('settings:get', () => {
    return settingsService.getSettings()
  })

  ipcMain.handle('settings:save', (_event, newSettings: AppSettings) => {
    settingsService.saveSettings(newSettings)
    container.updateSocketPath(newSettings.containerRuntime.socketPath)
  })
}
