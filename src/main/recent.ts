import { app, ipcMain } from 'electron'
import { basename, dirname, sep } from 'path'
import { channels, type RecentDocument } from '../shared/ipc'
import { broadcast, readStored, writeStored } from './store'

// How many documents File ▸ Open Recent and the welcome screen list.
export const maxRecent = 10

const recentFile = 'recent.json'

// The paths of the recently opened or saved files, the most recent first.
let paths: string[] = []
const listeners: (() => void)[] = []

// Keeps only valid values, so a damaged or hand-edited file can't break the app.
function validated(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const valid = values.filter((path): path is string => typeof path === 'string' && path !== '')
  return [...new Set(valid)].slice(0, maxRecent)
}

export function loadRecent(): void {
  paths = validated(readStored(recentFile))
}

// "/Users/me/Scripts/Big Fish.fountain" → name "Big Fish.fountain", folder "~/Scripts"
export function describeRecent(path: string, home: string): RecentDocument {
  const folder = dirname(path)
  const inHome = home !== '' && (folder === home || folder.startsWith(home + sep))
  return { path, name: basename(path), folder: inHome ? '~' + folder.slice(home.length) : folder }
}

export const getRecent = (): RecentDocument[] =>
  paths.map((path) => describeRecent(path, app.getPath('home')))

// Called when the list changes, e.g. to update the menu.
export function onRecentChanged(listener: () => void): void {
  listeners.push(listener)
}

function setRecent(next: string[]): void {
  next = validated(next)
  if (next.length === paths.length && next.every((path, i) => path === paths[i])) return
  paths = next
  writeStored(recentFile, paths, 'the recent documents')
  broadcast(channels.recentChanged, getRecent())
  for (const listener of listeners) listener()
}

// Moves the file to the top of the list.
export const addRecent = (path: string): void =>
  setRecent([path, ...paths.filter((p) => p !== path)])

// Forgets a file that could not be opened.
export const removeRecent = (path: string): void => setRecent(paths.filter((p) => p !== path))

export const clearRecent = (): void => setRecent([])

export function registerRecentHandlers(): void {
  ipcMain.handle(channels.getRecent, () => getRecent())
}
