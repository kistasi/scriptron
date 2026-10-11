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

// The open tabs, remembered so they can be reopened when the app relaunches.
export interface Session {
  // The files open in tabs, in tab order; untitled documents aren't remembered.
  paths: string[]
  activePath: string | null
}

export interface RestoredSession {
  // The remembered files that could still be read, in tab order.
  files: OpenedFile[]
  activePath: string | null
}

// A file in File ▸ Open Recent and on the welcome screen.
export interface RecentDocument {
  path: string
  name: string
  // The folder it's in, with the home folder shortened to "~".
  folder: string
}

export type MenuCommand =
  | 'new'
  | 'save'
  | 'save-as'
  | 'export-pdf'
  | 'find'
  | 'toggle-sidebar'
  | 'open-settings'
  | 'close-tab'
  | 'next-tab'
  | 'previous-tab'

export type Appearance = 'system' | 'light' | 'dark'

export interface Settings {
  appearance: Appearance
  // CSS pixels, for the sidebar and dialogs
  uiFontSize: number
  // Points; the screenplay page is shown at 12pt, and scales with the text so pagination holds.
  editorFontSize: number
  // Underlines misspellings with Chromium's spellchecker.
  checkSpelling: boolean
  // The user's own words, accepted on top of the spellchecker's dictionaries.
  dictionary: string[]
}

export const defaultSettings: Settings = {
  appearance: 'system',
  uiFontSize: 14,
  editorFontSize: 12,
  checkSpelling: true,
  dictionary: []
}

export const appearances: Appearance[] = ['system', 'light', 'dark']
export const uiFontSizes = [11, 12, 13, 14, 15, 16, 18, 20]
export const editorFontSizes = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24]

// "system" → "System", as the menu and the Settings dialog show it.
export const appearanceLabel = (appearance: Appearance): string =>
  appearance[0].toUpperCase() + appearance.slice(1)

// Pinching sets editor text sizes anywhere between those offered, to a tenth of a point.
export const minEditorFontSize = editorFontSizes[0]
export const maxEditorFontSize = editorFontSizes[editorFontSizes.length - 1]
export const roundFontSize = (size: number): number => Math.round(size * 10) / 10

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
  // renderer → main, with whether any open document has unsaved changes
  setDirty: 'document:dirty',
  // renderer → main (invoke) with the name of a document with unsaved changes; asks whether to
  // close it anyway, resolves to true to close it
  confirmClose: 'document:confirm-close',
  // renderer → main (invoke), resolves to the RestoredSession
  restoreSession: 'session:restore',
  // renderer → main, with the Session whenever it changes
  saveSession: 'session:save',
  // renderer → main, to ask which files to open with the Open dialog
  openDialog: 'file:open-dialog',
  // renderer → main, with the path of a file to open, e.g. a recent one
  openPath: 'file:open-path',
  // renderer → main (invoke), resolves to the titles of the bundled sample screenplays
  getSamples: 'samples:get',
  // renderer → main, with a sample's title; opens it as an untitled copy
  openSample: 'samples:open',
  // renderer → main (invoke), resolves to the RecentDocument[], the most recent first
  getRecent: 'recent:get',
  // main → renderer, with the RecentDocument[] whenever they change
  recentChanged: 'recent:changed',
  // renderer → main (invoke), resolves to the Settings
  getSettings: 'settings:get',
  // renderer → main, with a Partial<Settings> to change
  updateSettings: 'settings:update',
  // main → renderer, with the Settings whenever they change
  settingsChanged: 'settings:changed'
} as const
