import { ipcMain } from 'electron'
import type { PrerequisitesService } from '../services/prerequisites'
import type { SettingsService } from '../services/settings'
import type { AppSettings } from '../../shared/types'

export function setupPrerequisitesHandlers(
  prerequisites: PrerequisitesService,
  settings: SettingsService
): void {
  ipcMain.handle('prerequisites:check', async () => {
    return prerequisites.checkAll()
  })

  ipcMain.handle('settings:get', () => {
    return settings.getSettings()
  })

  ipcMain.handle('settings:save', (_event, newSettings: AppSettings) => {
    settings.saveSettings(newSettings)
  })
}
