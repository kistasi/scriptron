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
  const paths = { userData: '', home: '' }
  return {
    FakeWindow,
    handlers,
    paths,
    module: {
      app: { getPath: (name: 'userData' | 'home') => paths[name] },
      BrowserWindow: FakeWindow,
      ipcMain: {
        handle: (channel: string, listener: Listener) => handlers.set(channel, listener),
        on: (channel: string, listener: Listener) => handlers.set(channel, listener)
      },
      dialog: {
        showMessageBoxSync: vi.fn(),
        showMessageBox: vi.fn(),
        showOpenDialog: vi.fn(),
        showSaveDialog: vi.fn(),
        showErrorBox: vi.fn()
      }
    }
  }
})

vi.mock('electron', () => electron.module)

// The bundled samples, pointed at files a test writes.
const samples = vi.hoisted(() => [] as { title: string; path: string }[])
vi.mock('./samples', () => ({ samples }))

const { FakeWindow, handlers, paths } = electron
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
  paths.userData = dir
  paths.home = dir
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('saving', () => {
  it('writes to the given path without asking', async () => {
    const path = join(dir, 'Big Fish.fountain')
    const saved = await fromRenderer(channels.saveFile, 'INT. HOUSE', path, 'Big Fish.fountain')

    expect(saved).toEqual({ path, name: 'Big Fish.fountain' })
    expect(await readFile(path, 'utf-8')).toBe('INT. HOUSE')
    expect(dialog.showSaveDialog).not.toHaveBeenCalled()
  })

  it('asks where to save when there is no path, suggesting the name', async () => {
    const path = join(dir, 'New.fountain')
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: path })

    expect(await fromRenderer(channels.saveFile, 'text', null, 'Big-Fish.fountain')).toEqual({
      path,
      name: 'New.fountain'
    })
    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      window,
      expect.objectContaining({ defaultPath: 'Big-Fish.fountain' })
    )
    expect(await readFile(path, 'utf-8')).toBe('text')
  })

  it('resolves to null when the save dialog is cancelled', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' })
    expect(await fromRenderer(channels.saveFile, 'text', null, 'x.fountain')).toBeNull()
  })

  it('reports a failed write and resolves to null', async () => {
    const path = join(dir, 'missing', 'x.fountain')
    expect(await fromRenderer(channels.saveFile, 'text', path, 'x.fountain')).toBeNull()
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

describe('closing a tab', () => {
  it('asks before closing a document with unsaved changes', async () => {
    dialog.showMessageBox.mockResolvedValue({ response: cancelChoice })
    expect(await fromRenderer(channels.confirmClose, 'Big Fish.fountain')).toBe(false)
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      window,
      expect.objectContaining({ message: '“Big Fish.fountain” has unsaved changes.' })
    )

    dialog.showMessageBox.mockResolvedValue({ response: discardChoice })
    expect(await fromRenderer(channels.confirmClose, 'Big Fish.fountain')).toBe(true)
  })
})

describe('moving a scene', () => {
  it('asks before moving a scene', async () => {
    const move = { scene: '3. EXT. RIVER - NIGHT', target: '1. INT. HOUSE - DAY', after: false }
    dialog.showMessageBox.mockResolvedValue({ response: 1 })
    expect(await fromRenderer(channels.confirmMoveScene, move)).toBe(false)
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      window,
      expect.objectContaining({
        message: 'Move scene 3. EXT. RIVER - NIGHT?',
        detail: expect.stringContaining('before scene 1. INT. HOUSE - DAY')
      })
    )

    dialog.showMessageBox.mockResolvedValue({ response: 0 })
    expect(await fromRenderer(channels.confirmMoveScene, move)).toBe(true)
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

  it('sends each of several chosen files, without asking about unsaved changes', async () => {
    const paths = [join(dir, 'One.fountain'), join(dir, 'Two.fountain')]
    await writeFile(paths[0], 'one')
    await writeFile(paths[1], 'two')
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: paths })
    fromRenderer(channels.setDirty, true)

    await document.openDocument()
    expect(dialog.showMessageBoxSync).not.toHaveBeenCalled()
    const opened = window.webContents.send.mock.calls.filter(([c]) => c === channels.fileOpened)
    expect(opened).toEqual([
      [channels.fileOpened, { path: paths[0], name: 'One.fountain', content: 'one' }],
      [channels.fileOpened, { path: paths[1], name: 'Two.fountain', content: 'two' }]
    ])
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

describe('opening a sample', () => {
  it('sends it to the renderer as an untitled copy', async () => {
    const path = join(dir, 'Big-Fish.fountain')
    await writeFile(path, 'EXT. RIVER - DAY')

    await document.openSample(path)
    expect(window.webContents.send).toHaveBeenCalledWith(channels.fileOpened, {
      path: null,
      name: 'Big-Fish.fountain',
      content: 'EXT. RIVER - DAY'
    })
  })
})

describe('recent documents', () => {
  const recentPaths = (): string[] => {
    const calls = window.webContents.send.mock.calls.filter(([c]) => c === channels.recentChanged)
    return (calls.at(-1)?.[1] ?? []).map(({ path }: { path: string }) => path)
  }

  it('remembers opened and saved files, the most recent first', async () => {
    const one = join(dir, 'One.fountain')
    const two = join(dir, 'Two.fountain')
    await writeFile(one, 'one')
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [one] })

    await document.openDocument()
    expect(recentPaths()).toEqual([one])

    await fromRenderer(channels.saveFile, 'two', two, 'Two.fountain')
    expect(recentPaths()).toEqual([two, one])

    await document.openRecent(one)
    expect(recentPaths()).toEqual([one, two])
  })

  it('does not remember samples', async () => {
    const path = join(dir, 'Big-Fish.fountain')
    await writeFile(path, 'EXT. RIVER - DAY')
    await document.openSample(path)
    expect(recentPaths()).toEqual([])
  })

  it('opens a recent file from the renderer, forgetting it once it is gone', async () => {
    const path = join(dir, 'Big Fish.fountain')
    await writeFile(path, 'EXT. RIVER - DAY')
    await document.openRecent(path)
    await rm(path)

    fromRenderer(channels.openPath, path)
    await vi.waitFor(() => expect(dialog.showErrorBox).toHaveBeenCalled())
    expect(recentPaths()).toEqual([])
  })
})

describe('opening a sample from the renderer', () => {
  it('lists the samples by title, and opens one by its title', async () => {
    const path = join(dir, 'Big-Fish.fountain')
    await writeFile(path, 'EXT. RIVER - DAY')
    samples.splice(0, samples.length, { title: 'Big Fish', path })

    expect(await fromRenderer(channels.getSamples)).toEqual(['Big Fish'])
    fromRenderer(channels.openSample, 'Unknown')
    fromRenderer(channels.openSample, 'Big Fish')
    await vi.waitFor(() =>
      expect(window.webContents.send).toHaveBeenCalledWith(channels.fileOpened, {
        path: null,
        name: 'Big-Fish.fountain',
        content: 'EXT. RIVER - DAY'
      })
    )
    expect(window.webContents.send).toHaveBeenCalledTimes(1)
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
