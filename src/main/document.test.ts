import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { channels } from '../shared/ipc'

// A minimal stand-in for the parts of Electron that document.ts uses.
const electron = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => unknown

  class FakeWindow {
    static windows: FakeWindow[] = []
    static focused: FakeWindow | null = null
    static nextId = 1

    webContents = { id: FakeWindow.nextId++, send: vi.fn() }
    setDocumentEdited = vi.fn()
    listeners = new Map<string, Listener>()

    constructor() {
      FakeWindow.windows.push(this)
    }
    on(event: string, listener: Listener): void {
      this.listeners.set(event, listener)
    }
    // Emits 'close' and returns whether the close was allowed.
    close(): boolean {
      let prevented = false
      this.listeners.get('close')?.({ preventDefault: () => (prevented = true) })
      if (!prevented) this.listeners.get('closed')?.()
      return !prevented
    }

    static getFocusedWindow = (): FakeWindow | null => FakeWindow.focused
    static getAllWindows = (): FakeWindow[] => FakeWindow.windows
    static fromWebContents = (webContents: unknown): FakeWindow | undefined =>
      FakeWindow.windows.find((window) => window.webContents === webContents)
  }

  const handlers = new Map<string, Listener>()
  return {
    FakeWindow,
    handlers,
    module: {
      BrowserWindow: FakeWindow,
      ipcMain: {
        handle: (channel: string, listener: Listener) => handlers.set(channel, listener),
        on: (channel: string, listener: Listener) => handlers.set(channel, listener)
      },
      dialog: {
        showMessageBoxSync: vi.fn(),
        showOpenDialog: vi.fn(),
        showSaveDialog: vi.fn(),
        showErrorBox: vi.fn()
      }
    }
  }
})

vi.mock('electron', () => electron.module)

const { FakeWindow, handlers } = electron
const { dialog } = electron.module
type Document = typeof import('./document')

let document: Document
let window: InstanceType<typeof FakeWindow>
let dir: string

// Sends a renderer → main message from the window, as ipcRenderer would.
const fromRenderer = (channel: string, ...args: unknown[]): unknown =>
  handlers.get(channel)!({ sender: window.webContents }, ...args)

const discardChoice = 0
const cancelChoice = 1

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  handlers.clear()
  FakeWindow.windows = []
  document = await import('./document')
  document.registerDocumentHandlers()
  window = new FakeWindow()
  FakeWindow.focused = window
  document.guardUnsavedChanges(window as never)
  dir = await mkdtemp(join(tmpdir(), 'scriptron-test-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('saving', () => {
  it('writes to the given path without asking', async () => {
    const path = join(dir, 'Big Fish.fountain')
    const saved = await fromRenderer(channels.saveFile, 'INT. HOUSE', path)

    expect(saved).toEqual({ path, name: 'Big Fish.fountain' })
    expect(await readFile(path, 'utf-8')).toBe('INT. HOUSE')
    expect(dialog.showSaveDialog).not.toHaveBeenCalled()
  })

  it('asks where to save when there is no path', async () => {
    const path = join(dir, 'New.fountain')
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: path })

    expect(await fromRenderer(channels.saveFile, 'text', null)).toEqual({
      path,
      name: 'New.fountain'
    })
    expect(await readFile(path, 'utf-8')).toBe('text')
  })

  it('resolves to null when the save dialog is cancelled', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' })
    expect(await fromRenderer(channels.saveFile, 'text', null)).toBeNull()
  })

  it('reports a failed write and resolves to null', async () => {
    const path = join(dir, 'missing', 'x.fountain')
    expect(await fromRenderer(channels.saveFile, 'text', path)).toBeNull()
    expect(dialog.showErrorBox).toHaveBeenCalledWith(
      'Could not save file',
      expect.stringContaining(path)
    )
  })
})

describe('unsaved changes', () => {
  it('marks the window as edited', () => {
    fromRenderer(channels.setDirty, true)
    expect(window.setDocumentEdited).toHaveBeenLastCalledWith(true)
    fromRenderer(channels.setDirty, false)
    expect(window.setDocumentEdited).toHaveBeenLastCalledWith(false)
  })

  it('closes a clean window without asking', () => {
    expect(window.close()).toBe(true)
    expect(dialog.showMessageBoxSync).not.toHaveBeenCalled()
  })

  it('asks before closing a window with unsaved changes', () => {
    fromRenderer(channels.setDirty, true)

    dialog.showMessageBoxSync.mockReturnValue(cancelChoice)
    expect(window.close()).toBe(false)

    dialog.showMessageBoxSync.mockReturnValue(discardChoice)
    expect(window.close()).toBe(true)
  })

  it('stops asking once the changes are saved', () => {
    fromRenderer(channels.setDirty, true)
    fromRenderer(channels.setDirty, false)
    expect(window.close()).toBe(true)
    expect(dialog.showMessageBoxSync).not.toHaveBeenCalled()
  })

  it('only asks for the window that has unsaved changes', () => {
    const other = new FakeWindow()
    document.guardUnsavedChanges(other as never)
    fromRenderer(channels.setDirty, true)

    expect(other.close()).toBe(true)
    expect(dialog.showMessageBoxSync).not.toHaveBeenCalled()
  })
})

describe('new document', () => {
  it('tells the renderer to start a new document', () => {
    document.newDocument()
    expect(window.webContents.send).toHaveBeenCalledWith(channels.menuCommand, 'new')
  })

  it('keeps the current document if the user cancels discarding changes', () => {
    fromRenderer(channels.setDirty, true)
    dialog.showMessageBoxSync.mockReturnValue(cancelChoice)

    document.newDocument()
    expect(window.webContents.send).not.toHaveBeenCalled()
  })
})

describe('opening', () => {
  it('reads the chosen file and sends it to the renderer', async () => {
    const path = join(dir, 'Big Fish.fountain')
    await writeFile(path, 'EXT. RIVER - DAY')
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [path] })

    await document.openDocument()
    expect(window.webContents.send).toHaveBeenCalledWith(channels.fileOpened, {
      path,
      name: 'Big Fish.fountain',
      content: 'EXT. RIVER - DAY'
    })
  })

  it('does nothing when the open dialog is cancelled', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await document.openDocument()
    expect(window.webContents.send).not.toHaveBeenCalled()
  })

  it('does not show the open dialog if the user keeps unsaved changes', async () => {
    fromRenderer(channels.setDirty, true)
    dialog.showMessageBoxSync.mockReturnValue(cancelChoice)

    await document.openDocument()
    expect(dialog.showOpenDialog).not.toHaveBeenCalled()
  })

  it('reports a file that cannot be read', async () => {
    const path = join(dir, 'missing.fountain')
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [path] })

    await document.openDocument()
    expect(dialog.showErrorBox).toHaveBeenCalledWith(
      'Could not open file',
      expect.stringContaining(path)
    )
    expect(window.webContents.send).not.toHaveBeenCalled()
  })
})

describe('menu commands', () => {
  it('go to the focused window, or the first window when none is focused', () => {
    const other = new FakeWindow()
    FakeWindow.focused = other
    document.sendMenuCommand('save')
    expect(other.webContents.send).toHaveBeenCalledWith(channels.menuCommand, 'save')

    FakeWindow.focused = null
    document.sendMenuCommand('save-as')
    expect(window.webContents.send).toHaveBeenCalledWith(channels.menuCommand, 'save-as')
  })
})
