import { ipcMain, nativeTheme } from 'electron'
import {
  appearances,
  channels,
  defaultSettings,
  maxEditorFontSize,
  minEditorFontSize,
  roundFontSize,
  type Settings,
  uiFontSizes
} from '../shared/ipc'
import { broadcast, readStored, writeStored } from './store'

const settingsFile = 'settings.json'
// Where earlier versions saved only the appearance.
const legacyAppearanceFile = 'appearance.json'

let settings: Settings = defaultSettings
const listeners: (() => void)[] = []

function readObject(name: string): Record<string, unknown> {
  const value = readStored(name)
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

// Keeps only known, valid values, so a damaged or hand-edited file can't break the app.
function validated(values: Record<string, unknown>, base: Settings): Settings {
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback
  return {
    appearance: pick(values.appearance, appearances, base.appearance),
    uiFontSize: pick(values.uiFontSize, uiFontSizes, base.uiFontSize),
    editorFontSize: editorFontSize(values.editorFontSize, base.editorFontSize),
    checkSpelling:
      typeof values.checkSpelling === 'boolean' ? values.checkSpelling : base.checkSpelling,
    dictionary: Array.isArray(values.dictionary)
      ? dictionaryWords(values.dictionary)
      : base.dictionary
  }
}

// Pinching sets sizes between those offered, to a tenth of a point.
function editorFontSize(value: unknown, fallback: number): number {
  return typeof value === 'number' && value >= minEditorFontSize && value <= maxEditorFontSize
    ? roundFontSize(value)
    : fallback
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
    { ...readObject(legacyAppearanceFile), ...readObject(settingsFile) },
    defaultSettings
  )
  nativeTheme.themeSource = settings.appearance
}

export function updateSettings(changes: Partial<Settings>): void {
  settings = validated(changes, settings)
  nativeTheme.themeSource = settings.appearance
  writeStored(settingsFile, settings, 'the settings')
  broadcast(channels.settingsChanged, settings)
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
