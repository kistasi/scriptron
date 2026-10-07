import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { channels, type MenuCommand, type OpenedFile, type SavedFile } from '../shared/ipc'

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
  // Pass path = null to ask the user where to save. Resolves to null if cancelled or failed.
  saveFile: (content: string, path: string | null): Promise<SavedFile | null> =>
    ipcRenderer.invoke(channels.saveFile, content, path),
  setDirty: (dirty: boolean): void => ipcRenderer.send(channels.setDirty, dirty),
  // Prints the window's print view to a PDF. Resolves to false if cancelled or failed.
  exportPdf: (name: string): Promise<boolean> => ipcRenderer.invoke(channels.exportPdf, name)
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
