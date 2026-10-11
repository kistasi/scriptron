import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { guardUnsavedChanges, registerDocumentHandlers } from './document'
import { buildMenu } from './menu'
import { loadRecent, onRecentChanged, registerRecentHandlers } from './recent'
import { registerSessionHandlers } from './session'
import {
  loadSettings,
  onSettingsChanged,
  registerSettingsHandlers,
  windowBackground
} from './settings'
import { attachContextMenu, setUpSpellchecker } from './spellcheck'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: windowBackground(),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  guardUnsavedChanges(mainWindow)
  attachContextMenu(mainWindow)

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
}

app.whenReady().then(() => {
  // Matches appId in electron-builder.yml, which Windows needs for taskbar grouping and notifications.
  electronApp.setAppUserModelId('com.kistasi.scriptron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.setAboutPanelOptions({ copyright: 'Copyright © 2026 Marton Tasnadi\nMIT License' })

  loadSettings()
  loadRecent()
  registerDocumentHandlers()
  registerRecentHandlers()
  registerSessionHandlers()
  registerSettingsHandlers()
  setUpSpellchecker()
  buildMenu()
  // Keeps the menu's Appearance choice in step with the Settings dialog.
  onSettingsChanged(buildMenu)
  // Keeps File ▸ Open Recent up to date.
  onRecentChanged(buildMenu)
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
