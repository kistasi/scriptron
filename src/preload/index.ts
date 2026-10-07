import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { MenuCommand, OpenedFile, SavedFile } from '../main/menu'

const api = {
  onFileOpened: (callback: (file: OpenedFile) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, file: OpenedFile): void => callback(file)
    ipcRenderer.on('file:opened', listener)
    return () => ipcRenderer.removeListener('file:opened', listener)
  },
  onMenuCommand: (callback: (command: MenuCommand) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, command: MenuCommand): void => callback(command)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
  // Pass path = null to ask the user where to save. Resolves to null if cancelled or failed.
  saveFile: (content: string, path: string | null): Promise<SavedFile | null> =>
    ipcRenderer.invoke('file:save', content, path),
  setDirty: (dirty: boolean): void => ipcRenderer.send('document:dirty', dirty)
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
