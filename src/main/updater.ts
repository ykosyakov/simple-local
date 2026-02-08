import { BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { createLogger } from '../shared/logger'

const log = createLogger('Updater')

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', async (info) => {
    log.info(`Update available: ${info.version}`)
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available. Download now?`,
      buttons: ['Download', 'Later']
    })
    if (response === 0) {
      autoUpdater.downloadUpdate()
    }
  })

  autoUpdater.on('update-downloaded', async (info) => {
    log.info(`Update downloaded: ${info.version}`)
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded. Restart now to install?`,
      buttons: ['Restart', 'Later']
    })
    if (response === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-update error:', err)
  })

  setTimeout(() => {
    log.info('Checking for updates...')
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Failed to check for updates:', err)
    })
  }, 5000)
}
