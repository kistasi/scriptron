import { BrowserWindow, dialog, ipcMain, type MessageBoxOptions } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { basename } from 'path'
import {
  channels,
  type MenuCommand,
  type OpenedFile,
  type SavedFile,
  type SceneMove
} from '../shared/ipc'
import { addRecent, removeRecent } from './recent'
import { samples } from './samples'

const fountainFilters = [{ name: 'Fountain', extensions: ['fountain'] }]
const pdfFilters = [{ name: 'PDF', extensions: ['pdf'] }]

// webContents ids of windows with a document that has unsaved changes
const dirtyWindows = new Set<number>()

function targetWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

// A warning that unsaved changes will be lost, whose first button discards them.
const discardOptions = (message: string, detail: string): MessageBoxOptions => ({
  type: 'warning',
  message,
  detail,
  buttons: ['Discard Changes', 'Cancel'],
  defaultId: 1,
  cancelId: 1
})

// Returns true when the window has no unsaved changes or the user chose to discard them.
// Synchronous, since it decides whether a closing window may close.
function confirmDiscard(window: BrowserWindow): boolean {
  if (!dirtyWindows.has(window.webContents.id)) return true
  const options = discardOptions(
    'You have unsaved changes.',
    'Your changes will be lost if you continue.'
  )
  return dialog.showMessageBoxSync(window, options) === 0
}

// Asks whether to close a tab whose document has unsaved changes; true to close it.
async function confirmClose(window: BrowserWindow, name: string): Promise<boolean> {
  const options = discardOptions(
    `“${name}” has unsaved changes.`,
    'Your changes will be lost if you close it.'
  )
  const { response } = await dialog.showMessageBox(window, options)
  return response === 0
}

// Asks whether to move a scene dragged in the outline; true to move it.
async function confirmMoveScene(
  window: BrowserWindow,
  { scene, target, after }: SceneMove
): Promise<boolean> {
  const { response } = await dialog.showMessageBox(window, {
    type: 'question',
    message: `Move scene ${scene}?`,
    detail: `It will be placed ${after ? 'after' : 'before'} scene ${target}. You can undo the move with Edit › Undo.`,
    buttons: ['Move Scene', 'Cancel'],
    defaultId: 0,
    cancelId: 1
  })
  return response === 0
}

function showFileError(title: string, path: string, error: unknown): void {
  dialog.showErrorBox(title, `${path}\n\n${(error as Error).message}`)
}

export function sendMenuCommand(command: MenuCommand): void {
  targetWindow()?.webContents.send(channels.menuCommand, command)
}

// Opens the chosen files, each in a tab of its own.
export async function openDocument(): Promise<void> {
  const window = targetWindow()
  if (!window) return

  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Open Screenplay',
    properties: ['openFile', 'multiSelections'],
    filters: fountainFilters
  })
  if (canceled) return

  for (const path of filePaths) await sendFile(window, path, false)
}

// Opens a recently opened file, forgetting it if it can no longer be read.
export async function openRecent(path: string): Promise<void> {
  const window = targetWindow()
  if (window) await sendFile(window, path, false)
}

// Opens a bundled sample as an untitled copy, so saving asks for a location.
export async function openSample(path: string): Promise<void> {
  const window = targetWindow()
  if (window) await sendFile(window, path, true)
}

// Reads the file and sends it to the renderer, detached from its path when untitled.
// A file opened with its path is remembered as recent.
async function sendFile(window: BrowserWindow, path: string, untitled: boolean): Promise<void> {
  try {
    const content = await readFile(path, 'utf-8')
    const file: OpenedFile = { path: untitled ? null : path, name: basename(path), content }
    window.webContents.send(channels.fileOpened, file)
    if (!untitled) addRecent(path)
  } catch (error) {
    if (!untitled) removeRecent(path)
    showFileError('Could not open file', path, error)
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
    addRecent(path)
    return { path, name: basename(path) }
  } catch (error) {
    showFileError('Could not save file', path, error)
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
    showFileError('Could not export PDF', result.filePath, error)
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

  ipcMain.on(channels.openDialog, () => void openDocument())
  ipcMain.on(channels.openPath, (_event, path: string) => void openRecent(path))
  ipcMain.handle(channels.getSamples, () => samples.map(({ title }) => title))
  ipcMain.on(channels.openSample, (_event, title: string) => {
    const sample = samples.find((sample) => sample.title === title)
    if (sample) void openSample(sample.path)
  })

  ipcMain.handle(channels.confirmClose, (event, name: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window ? confirmClose(window, name) : false
  })

  ipcMain.handle(channels.confirmMoveScene, (event, move: SceneMove) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window ? confirmMoveScene(window, move) : false
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
