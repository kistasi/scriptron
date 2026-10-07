import { BrowserWindow, Menu, MenuItemConstructorOptions, app, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { basename } from 'path'

export interface OpenedFile {
  path: string
  name: string
  content: string
}

export interface SavedFile {
  path: string
  name: string
}

export type MenuCommand = 'new' | 'save' | 'save-as'

const fountainFilters = [{ name: 'Fountain', extensions: ['fountain'] }]

// webContents ids of windows whose document has unsaved changes
const dirtyWindows = new Set<number>()

function targetWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

// Returns true when the window has no unsaved changes or the user chose to discard them.
function confirmDiscard(window: BrowserWindow): boolean {
  if (!dirtyWindows.has(window.webContents.id)) return true

  const choice = dialog.showMessageBoxSync(window, {
    type: 'warning',
    message: 'You have unsaved changes.',
    detail: 'Your changes will be lost if you continue.',
    buttons: ['Discard Changes', 'Cancel'],
    defaultId: 1,
    cancelId: 1
  })
  return choice === 0
}

function newDocument(): void {
  const window = targetWindow()
  if (!window || !confirmDiscard(window)) return
  window.webContents.send('menu:command', 'new' satisfies MenuCommand)
}

async function openFountainFile(): Promise<void> {
  const window = targetWindow()
  if (!window || !confirmDiscard(window)) return

  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Open Screenplay',
    properties: ['openFile'],
    filters: fountainFilters
  })
  if (canceled || filePaths.length === 0) return

  const path = filePaths[0]
  try {
    const content = await readFile(path, 'utf-8')
    const file: OpenedFile = { path, name: basename(path), content }
    window.webContents.send('file:opened', file)
  } catch (error) {
    dialog.showErrorBox('Could not open file', `${path}\n\n${(error as Error).message}`)
  }
}

function sendCommand(command: MenuCommand): void {
  targetWindow()?.webContents.send('menu:command', command)
}

// Writes the content to path, or asks for a location first when path is null.
async function saveFile(
  window: BrowserWindow,
  content: string,
  path: string | null
): Promise<SavedFile | null> {
  if (!path) {
    const result = await dialog.showSaveDialog(window, {
      title: 'Save Screenplay',
      defaultPath: 'Untitled.fountain',
      filters: fountainFilters
    })
    if (result.canceled || !result.filePath) return null
    path = result.filePath
  }

  try {
    await writeFile(path, content, 'utf-8')
    return { path, name: basename(path) }
  } catch (error) {
    dialog.showErrorBox('Could not save file', `${path}\n\n${(error as Error).message}`)
    return null
  }
}

export function registerFileHandlers(): void {
  ipcMain.handle('file:save', (event, content: string, path: string | null) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window ? saveFile(window, content, path) : null
  })

  ipcMain.on('document:dirty', (event, dirty: boolean) => {
    const id = event.sender.id
    if (dirty) dirtyWindows.add(id)
    else dirtyWindows.delete(id)
    BrowserWindow.fromWebContents(event.sender)?.setDocumentEdited(dirty)
  })
}

export function guardUnsavedChanges(window: BrowserWindow): void {
  const id = window.webContents.id
  window.on('close', (event) => {
    if (!confirmDiscard(window)) event.preventDefault()
  })
  window.on('closed', () => dirtyWindows.delete(id))
}

export function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: app.name, role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => newDocument() },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => openFountainFile() },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('save') },
        {
          label: 'Save As…',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => sendCommand('save-as')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
