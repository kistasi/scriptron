import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  channels,
  type MenuCommand,
  type OpenedFile,
  type SavedFile,
  type Settings,
  type TextCheckOptions,
  type TextIssue,
  type TextMenuAction,
  type TextMenuIssue
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
  // Prints the window's print view to a PDF. Resolves to false if cancelled or failed.
  exportPdf: (name: string): Promise<boolean> => ipcRenderer.invoke(channels.exportPdf, name),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(channels.getSettings),
  // Saved and applied by the main process, which then sends the result to onSettingsChanged.
  updateSettings: (changes: Partial<Settings>): void =>
    ipcRenderer.send(channels.updateSettings, changes),
  onSettingsChanged: (callback: (settings: Settings) => void): (() => void) =>
    subscribe(channels.settingsChanged, callback),
  // Whether the operating system's spelling and grammar checker is available (macOS only).
  textCheckAvailable: (): Promise<boolean> => ipcRenderer.invoke(channels.textCheckAvailable),
  // Checks each text separately, resolving to its issues.
  checkText: (texts: string[], options: TextCheckOptions): Promise<TextIssue[][]> =>
    ipcRenderer.invoke(channels.checkText, texts, options),
  // Shows the editor's context menu, with suggestions for the issue under the pointer if any.
  showTextMenu: (issue: TextMenuIssue | null): Promise<TextMenuAction> =>
    ipcRenderer.invoke(channels.showTextMenu, issue)
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
