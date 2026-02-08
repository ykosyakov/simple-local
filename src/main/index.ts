import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fixPath from 'fix-path'
import { setupIpcHandlers } from './ipc'
import { setupUpdaterIpc } from './updater'
import { setupTray } from './tray'
import { createApiServer, ApiServer } from './services/api-server'
import { createLogger } from '../shared/logger'
import './electron-types'

fixPath()

const log = createLogger('Main')

let apiServer: ApiServer | null = null
let cleanupNativeProcesses: (() => Promise<void>) | null = null

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.simple-local')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Setup IPC handlers and get services
  const ipcHandlers = setupIpcHandlers()
  const { registry, container, config, getLogBuffer, startService, stopService } = ipcHandlers
  cleanupNativeProcesses = ipcHandlers.cleanupNativeProcesses

  // Create main window
  const mainWindow = createWindow()

  // Setup tray
  setupTray(mainWindow)

  // Setup updater IPC handlers (always) and auto-updater (production only)
  setupUpdaterIpc(mainWindow, !is.dev)

  // Start API server
  try {
    apiServer = await createApiServer({
      port: 19275,
      registry,
      container,
      config,
      getLogBuffer,
      onServiceStart: startService,
      onServiceStop: stopService,
    })
    log.info(`API server listening on http://127.0.0.1:${apiServer.port}`)
  } catch (err) {
    log.error('Failed to start API server:', err)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', async () => {
  app.isQuitting = true
  if (cleanupNativeProcesses) {
    await cleanupNativeProcesses()
  }
  if (apiServer) {
    await apiServer.close()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
