import { BrowserWindow, app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// The app's own files, such as the settings, kept in its user data folder.
const storePath = (name: string): string => join(app.getPath('userData'), name)

// The parsed contents of a stored file, or undefined if it's missing or damaged. Callers validate
// what they get, so a hand-edited file can't break the app.
export function readStored(name: string): unknown {
  try {
    return JSON.parse(readFileSync(storePath(name), 'utf8'))
  } catch {
    return undefined
  }
}

// Saves the value; what describes it in the error logged if that fails, e.g. "the settings".
export function writeStored(name: string, value: unknown, what: string): void {
  try {
    writeFileSync(storePath(name), JSON.stringify(value))
  } catch (error) {
    console.error(`Could not save ${what}`, error)
  }
}

// Sends the value to every window's renderer.
export function broadcast(channel: string, value: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, value)
}
