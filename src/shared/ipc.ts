// IPC contract between the main process and the preload script.

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

export const channels = {
  // main → renderer, with an OpenedFile
  fileOpened: 'file:opened',
  // main → renderer, with a MenuCommand
  menuCommand: 'menu:command',
  // renderer → main (invoke) with (content, path | null), resolves to SavedFile | null
  saveFile: 'file:save',
  // renderer → main, with whether the document has unsaved changes
  setDirty: 'document:dirty'
} as const
