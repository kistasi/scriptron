import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  channels,
  type MenuCommand,
  type OpenedFile,
  type RestoredSession,
  type SavedFile,
  type Session,
  type Settings
} from '../shared/ipc'

// Subscribes to a main → renderer channel; returns a function that unsubscribes.
function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  onFileOpened: (callback: (file: OpenedFile) => void): (() => void) =>
    subscribe(channels.fileOpened, callback),
  onMenuCommand: (callback: (command: MenuCommand) => void): (() => void) =>
    subscribe(channels.menuCommand, callback),
  // Pass path = null to ask the user where to save, suggesting name. Resolves to null if cancelled
  // or failed.
  saveFile: (content: string, path: string | null, name: string): Promise<SavedFile | null> =>
    ipcRenderer.invoke(channels.saveFile, content, path, name),
  setDirty: (dirty: boolean): void => ipcRenderer.send(channels.setDirty, dirty),
  // Asks whether to close the named document and lose its unsaved changes.
  confirmClose: (name: string): Promise<boolean> => ipcRenderer.invoke(channels.confirmClose, name),
  // Prints the window's print view to a PDF. Resolves to false if cancelled or failed.
  exportPdf: (name: string): Promise<boolean> => ipcRenderer.invoke(channels.exportPdf, name),
  // Reads the files that were open in tabs when the app last ran.
  restoreSession: (): Promise<RestoredSession> => ipcRenderer.invoke(channels.restoreSession),
  saveSession: (session: Session): void => ipcRenderer.send(channels.saveSession, session),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(channels.getSettings),
  // Saved and applied by the main process, which then sends the result to onSettingsChanged.
  updateSettings: (changes: Partial<Settings>): void =>
    ipcRenderer.send(channels.updateSettings, changes),
  onSettingsChanged: (callback: (settings: Settings) => void): (() => void) =>
    subscribe(channels.settingsChanged, callback)
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
