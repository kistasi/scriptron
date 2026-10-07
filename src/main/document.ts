import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { basename } from 'path'
import { channels, type MenuCommand, type OpenedFile, type SavedFile } from '../shared/ipc'

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

export function sendMenuCommand(command: MenuCommand): void {
  targetWindow()?.webContents.send(channels.menuCommand, command)
}

export function newDocument(): void {
  const window = targetWindow()
  if (!window || !confirmDiscard(window)) return
  window.webContents.send(channels.menuCommand, 'new' satisfies MenuCommand)
}

export async function openDocument(): Promise<void> {
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
    window.webContents.send(channels.fileOpened, file)
  } catch (error) {
    dialog.showErrorBox('Could not open file', `${path}\n\n${(error as Error).message}`)
  }
}

// Writes the content to path, or asks for a location first when path is null.
async function saveDocument(
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

export function registerDocumentHandlers(): void {
  ipcMain.handle(channels.saveFile, (event, content: string, path: string | null) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window ? saveDocument(window, content, path) : null
  })

  ipcMain.on(channels.setDirty, (event, dirty: boolean) => {
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
