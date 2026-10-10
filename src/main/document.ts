import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { basename } from 'path'
import { channels, type MenuCommand, type OpenedFile, type SavedFile } from '../shared/ipc'

const fountainFilters = [{ name: 'Fountain', extensions: ['fountain'] }]
const pdfFilters = [{ name: 'PDF', extensions: ['pdf'] }]

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

  await sendFile(window, filePaths[0], false)
}

// Opens a bundled sample as an untitled copy, so saving asks for a location.
export async function openSample(path: string): Promise<void> {
  const window = targetWindow()
  if (!window || !confirmDiscard(window)) return
  await sendFile(window, path, true)
}

// Reads the file and sends it to the renderer, detached from its path when untitled.
async function sendFile(window: BrowserWindow, path: string, untitled: boolean): Promise<void> {
  try {
    const content = await readFile(path, 'utf-8')
    const file: OpenedFile = { path: untitled ? null : path, name: basename(path), content }
    window.webContents.send(channels.fileOpened, file)
  } catch (error) {
    dialog.showErrorBox('Could not open file', `${path}\n\n${(error as Error).message}`)
  }
}

// Writes the content to path, or asks for a location first (suggesting name) when path is null.
async function saveDocument(
  window: BrowserWindow,
  content: string,
  path: string | null,
  name: string
): Promise<SavedFile | null> {
  if (!path) {
    const result = await dialog.showSaveDialog(window, {
      title: 'Save Screenplay',
      defaultPath: name,
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

// Prints the window (its print view, see PrintView) to a PDF at a location the user chooses.
async function exportPdf(window: BrowserWindow, name: string): Promise<boolean> {
  const result = await dialog.showSaveDialog(window, {
    title: 'Export PDF',
    defaultPath: name,
    filters: pdfFilters
  })
  if (result.canceled || !result.filePath) return false

  try {
    const pdf = await window.webContents.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
    await writeFile(result.filePath, pdf)
    return true
  } catch (error) {
    dialog.showErrorBox('Could not export PDF', `${result.filePath}\n\n${(error as Error).message}`)
    return false
  }
}

export function registerDocumentHandlers(): void {
  ipcMain.handle(channels.saveFile, (event, content: string, path: string | null, name: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window ? saveDocument(window, content, path, name) : null
  })

  ipcMain.handle(channels.exportPdf, (event, name: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window ? exportPdf(window, name) : false
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
