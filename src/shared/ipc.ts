// IPC contract between the main process and the preload script.

export interface OpenedFile {
  // null for a document that isn't backed by a file yet, e.g. a sample
  path: string | null
  name: string
  content: string
}

export interface SavedFile {
  path: string
  name: string
}

export type MenuCommand = 'new' | 'save' | 'save-as' | 'export-pdf' | 'toggle-sidebar'

export const channels = {
  // main → renderer, with an OpenedFile
  fileOpened: 'file:opened',
  // main → renderer, with a MenuCommand
  menuCommand: 'menu:command',
  // renderer → main (invoke) with (content, path | null, suggested file name), resolves to
  // SavedFile | null
  saveFile: 'file:save',
  // renderer → main (invoke) with the suggested file name; prints the window to a PDF the user
  // chooses, resolves to whether it was written
  exportPdf: 'file:export-pdf',
  // renderer → main, with whether the document has unsaved changes
  setDirty: 'document:dirty'
} as const
