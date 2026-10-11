import { app, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { basename, join } from 'path'
import { channels, type OpenedFile, type RestoredSession, type Session } from '../shared/ipc'

const sessionPath = (): string => join(app.getPath('userData'), 'session.json')

// Keeps only valid values, so a damaged or hand-edited file can't break the app.
function validated(values: unknown): Session {
  const { paths, activePath } = (values ?? {}) as Record<string, unknown>
  return {
    paths: Array.isArray(paths) ? paths.filter((path) => typeof path === 'string') : [],
    activePath: typeof activePath === 'string' ? activePath : null
  }
}

function loadSession(): Session {
  try {
    return validated(JSON.parse(readFileSync(sessionPath(), 'utf8')))
  } catch {
    return validated(null)
  }
}

export function saveSession(session: Session): void {
  try {
    writeFileSync(sessionPath(), JSON.stringify(validated(session)))
  } catch (error) {
    console.error('Could not save the open tabs', error)
  }
}

// Reads the remembered files, skipping any that were moved or deleted since.
export async function restoreSession(): Promise<RestoredSession> {
  const { paths, activePath } = loadSession()
  const files = await Promise.all(
    paths.map(async (path): Promise<OpenedFile | null> => {
      try {
        return { path, name: basename(path), content: await readFile(path, 'utf-8') }
      } catch {
        return null
      }
    })
  )
  return { files: files.filter((file) => file !== null), activePath }
}

export function registerSessionHandlers(): void {
  ipcMain.handle(channels.restoreSession, () => restoreSession())
  ipcMain.on(channels.saveSession, (_event, session: Session) => saveSession(session))
}
