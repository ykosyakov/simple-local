import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { createLogger } from '../shared/logger'
import type { UpdateState, UpdateInfo, UpdateProgress } from '../shared/types'

const log = createLogger('Updater')

let mainWindow: BrowserWindow | null = null
let currentState: UpdateState = { status: 'idle' }
let isProduction = false

function updateState(newState: UpdateState): void {
  currentState = newState
  mainWindow?.webContents.send('updater:state-change', currentState)
}

export function setupUpdaterIpc(window: BrowserWindow, production: boolean): void {
  mainWindow = window
  isProduction = production

  // IPC handlers - always registered
  ipcMain.handle('updater:get-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('updater:get-state', () => {
    return currentState
  })

  ipcMain.handle('updater:check', async () => {
    if (!isProduction) {
      log.info('Skipping update check in dev mode')
      return
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      log.error('Failed to check for updates:', err)
      updateState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to check for updates'
      })
    }
  })

  ipcMain.handle('updater:download', async () => {
    if (!isProduction) {
      log.info('Skipping download in dev mode')
      return
    }
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      log.error('Failed to download update:', err)
      updateState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to download update'
      })
    }
  })

  ipcMain.handle('updater:install', () => {
    if (!isProduction) {
      log.info('Skipping install in dev mode')
      return
    }
    app.isQuitting = true
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('updater:dismiss', () => {
    updateState({ status: 'idle' })
  })

  // Only setup auto-updater in production
  if (isProduction) {
    setupAutoUpdater()
  }
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
    updateState({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: ${info.version}`)
    const updateInfo: UpdateInfo = {
      version: info.version,
      releaseDate: info.releaseDate
    }
    updateState({ status: 'available', info: updateInfo })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('No update available')
    updateState({ status: 'idle' })
  })

  autoUpdater.on('download-progress', (progress) => {
    const updateProgress: UpdateProgress = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    }
    updateState({
      status: 'downloading',
      info: currentState.info,
      progress: updateProgress
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`Update downloaded: ${info.version}`)
    const updateInfo: UpdateInfo = {
      version: info.version,
      releaseDate: info.releaseDate
    }
    updateState({ status: 'ready', info: updateInfo })
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-update error:', err)
    updateState({ status: 'error', error: err.message })
  })

  // Auto-check after 5s delay
  setTimeout(() => {
    log.info('Auto-checking for updates...')
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Failed to check for updates:', err)
    })
  }, 5000)
}
