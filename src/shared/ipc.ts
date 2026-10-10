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

export type MenuCommand =
  'new' | 'save' | 'save-as' | 'export-pdf' | 'find' | 'toggle-sidebar' | 'open-settings'

export type Appearance = 'system' | 'light' | 'dark'

export interface Settings {
  appearance: Appearance
  // CSS pixels, for the sidebar and dialogs
  uiFontSize: number
  // Points; the screenplay page is shown at 12pt, and scales with the text so pagination holds.
  editorFontSize: number
  // Underlines found by the operating system's checker (macOS only).
  checkSpelling: boolean
  checkGrammar: boolean
  // The user's own words, accepted on top of the system dictionary.
  dictionary: string[]
}

export const defaultSettings: Settings = {
  appearance: 'system',
  uiFontSize: 14,
  editorFontSize: 12,
  checkSpelling: true,
  checkGrammar: true,
  dictionary: []
}

export const appearances: Appearance[] = ['system', 'light', 'dark']
export const uiFontSizes = [11, 12, 13, 14, 15, 16, 18, 20]
export const editorFontSizes = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24]

export interface TextIssue {
  kind: 'spelling' | 'grammar'
  // Offsets within the checked text.
  from: number
  to: number
  // For grammar: what the issue is, and suggested replacements for the range.
  message?: string
  corrections?: string[]
}

export interface TextCheckOptions {
  spelling: boolean
  grammar: boolean
}

// The issue under the pointer when the editor's context menu opens, if any.
export interface TextMenuIssue {
  kind: TextIssue['kind']
  // The text the issue covers.
  text: string
  message?: string
  corrections?: string[]
}

// What was chosen from the editor's context menu, beyond the standard edit commands.
export type TextMenuAction =
  { type: 'replace'; text: string } | { type: 'learn' } | { type: 'ignore' } | null

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
  setDirty: 'document:dirty',
  // renderer → main (invoke), resolves to the Settings
  getSettings: 'settings:get',
  // renderer → main, with a Partial<Settings> to change
  updateSettings: 'settings:update',
  // main → renderer, with the Settings whenever they change
  settingsChanged: 'settings:changed',
  // renderer → main (invoke), resolves to whether spelling and grammar can be checked here
  textCheckAvailable: 'text:available',
  // renderer → main (invoke) with (texts, TextCheckOptions), resolves to a TextIssue[] per text
  checkText: 'text:check',
  // renderer → main (invoke) with a TextMenuIssue | null; shows the editor's context menu and
  // resolves to the TextMenuAction chosen
  showTextMenu: 'text:menu'
} as const
