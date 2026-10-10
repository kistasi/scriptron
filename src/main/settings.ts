import { BrowserWindow, app, ipcMain, nativeTheme } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  appearances,
  channels,
  defaultSettings,
  editorFontSizes,
  type Settings,
  uiFontSizes
} from '../shared/ipc'

const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')
// Where earlier versions saved only the appearance.
const legacyAppearancePath = (): string => join(app.getPath('userData'), 'appearance.json')

let settings: Settings = defaultSettings
const listeners: (() => void)[] = []

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

// Keeps only known, valid values, so a damaged or hand-edited file can't break the app.
function validated(values: Record<string, unknown>, base: Settings): Settings {
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback
  return {
    appearance: pick(values.appearance, appearances, base.appearance),
    uiFontSize: pick(values.uiFontSize, uiFontSizes, base.uiFontSize),
    editorFontSize: pick(values.editorFontSize, editorFontSizes, base.editorFontSize),
    checkSpelling:
      typeof values.checkSpelling === 'boolean' ? values.checkSpelling : base.checkSpelling,
    checkGrammar:
      typeof values.checkGrammar === 'boolean' ? values.checkGrammar : base.checkGrammar,
    dictionary: Array.isArray(values.dictionary)
      ? dictionaryWords(values.dictionary)
      : base.dictionary
  }
}

// Single words, without duplicates, in alphabetical order.
export function dictionaryWords(values: unknown[]): string[] {
  const words = values
    .filter((value): value is string => typeof value === 'string')
    .map((word) => word.trim())
    .filter((word) => word && word.length <= 100 && !/\s/.test(word))
  return [...new Set(words)].sort((a, b) => a.localeCompare(b))
}

export const getSettings = (): Settings => settings

// Called when the settings change, e.g. to update the menu.
export function onSettingsChanged(listener: () => void): void {
  listeners.push(listener)
}

// nativeTheme.themeSource drives prefers-color-scheme in the renderer, which switches
// the CSS color variables. The settings are remembered across launches.
export function loadSettings(): void {
  settings = validated(
    { ...readJson(legacyAppearancePath()), ...readJson(settingsPath()) },
    defaultSettings
  )
  nativeTheme.themeSource = settings.appearance
}

export function updateSettings(changes: Partial<Settings>): void {
  settings = validated(changes, settings)
  nativeTheme.themeSource = settings.appearance
  try {
    writeFileSync(settingsPath(), JSON.stringify(settings))
  } catch (error) {
    console.error('Could not save settings', error)
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channels.settingsChanged, settings)
  }
  for (const listener of listeners) listener()
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(channels.getSettings, () => settings)
  ipcMain.on(channels.updateSettings, (_event, changes: Partial<Settings>) =>
    updateSettings(changes)
  )
}

// Matches the editor's desk color, so the window does not flash before the page loads.
export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#141414' : '#eceae6'
}
