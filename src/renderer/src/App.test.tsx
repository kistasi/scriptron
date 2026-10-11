// @vitest-environment jsdom
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api } from '../../preload'
import {
  defaultSettings,
  type MenuCommand,
  type OpenedFile,
  type RecentDocument,
  type RestoredSession,
  type SavedFile,
  type Settings
} from '../../shared/ipc'
import App from './App'
import { NEW_SCRIPT, NEW_SCRIPT_CURSOR } from './lib/tabs'

// The real editor needs a browser layout engine; this stand-in records the props of each mounted
// editor (one per tab), exposes onChange and onCursorLine so tests can type and move the cursor,
// and records goToLine, openSearch and replaceText calls, openSearch with the editor's initial text.
interface EditorProps {
  initialText: string
  initialCursor: number
  fontSize: number
  checkSpelling: boolean
  visible: boolean
  onChange: (text: string) => void
  onCursorLine: (line: number) => void
  onPreviewPdf: () => void
  ref: React.Ref<{
    goToLine: (line: number) => void
    openSearch: () => void
    replaceText: (text: string) => void
  }>
}
let editors: Map<number, Omit<EditorProps, 'ref'>>
let mounts: number
const goToLine = vi.fn()
const openSearch = vi.fn()
const replaceText = vi.fn()
vi.mock('./Editor', async () => {
  const { useEffect, useImperativeHandle, useState } = await import('react')
  return {
    Editor: ({ ref, ...props }: EditorProps) => {
      const [n] = useState(() => mounts++)
      editors.set(n, props)
      useImperativeHandle(ref, () => ({
        goToLine,
        openSearch: () => openSearch(props.initialText),
        replaceText
      }))
      useEffect(() => () => void editors.delete(n), [n])
      return null
    }
  }
})

// The editor of the shown tab.
const editor = (): Omit<EditorProps, 'ref'> => [...editors.values()].find((e) => e.visible)!

// jsdom doesn't lay out, so there is nothing to scroll.
Element.prototype.scrollIntoView = () => {}

let fileOpened: (file: OpenedFile) => void
let menuCommand: (command: MenuCommand) => void
let settingsChanged: (settings: Settings) => void
let recentChanged: (recent: RecentDocument[]) => void
let api: { [K in keyof Api]: ReturnType<typeof vi.fn> }

// A save that the test resolves when it chooses, like a save dialog left open.
function pendingSave(): (result: SavedFile | null) => Promise<void> {
  let resolve!: (result: SavedFile | null) => void
  api.saveFile.mockReturnValueOnce(new Promise((r) => (resolve = r)))
  return (result) => act(async () => resolve(result))
}

const type = (text: string): void => act(() => editor().onChange(text))
const command = (name: MenuCommand): void => act(() => menuCommand(name))
const open = (file: OpenedFile): void => act(() => fileOpened(file))
const isDirty = (): boolean => api.setDirty.mock.lastCall?.[0]

const bigFish = { path: '/scripts/Big Fish.fountain', name: 'Big Fish.fountain' }

const tabNames = (): string[] => screen.queryAllByRole('tab').map((tab) => tab.textContent ?? '')
const selectedTab = (): string | null => screen.getByRole('tab', { selected: true }).textContent

const sceneTitles = (): string[] =>
  screen.queryAllByRole('listitem').map((item) => item.textContent ?? '')

// The tabs restored from the last launch, set before a test renders the app again.
let restoredSession: RestoredSession
let recent: RecentDocument[]

const renderApp = (): Promise<void> =>
  act(async () => {
    cleanup()
    render(<App />)
  })

beforeEach(async () => {
  restoredSession = { files: [], activePath: null }
  recent = []
  editors = new Map()
  mounts = 0
  goToLine.mockClear()
  openSearch.mockClear()
  replaceText.mockClear()
  localStorage.clear()
  api = {
    onFileOpened: vi.fn((callback) => ((fileOpened = callback), () => {})),
    onMenuCommand: vi.fn((callback) => ((menuCommand = callback), () => {})),
    saveFile: vi.fn(),
    setDirty: vi.fn(),
    confirmClose: vi.fn(),
    confirmMoveScene: vi.fn(),
    exportPdf: vi.fn(),
    getSettings: vi.fn(() => Promise.resolve(defaultSettings)),
    updateSettings: vi.fn(),
    onSettingsChanged: vi.fn((callback) => ((settingsChanged = callback), () => {})),
    restoreSession: vi.fn(() => Promise.resolve(restoredSession)),
    saveSession: vi.fn(),
    openDialog: vi.fn(),
    openPath: vi.fn(),
    getRecent: vi.fn(() => Promise.resolve(recent)),
    getSamples: vi.fn(() => Promise.resolve(['Big Fish'])),
    openSample: vi.fn(),
    onRecentChanged: vi.fn((callback) => ((recentChanged = callback), () => {}))
  }
  window.api = api as unknown as Api
  await renderApp()
  // Past the welcome screen, onto the blank untitled document.
  command('new')
})

afterEach(cleanup)

describe('welcome screen', () => {
  const welcomeShown = (): boolean => screen.queryByRole('heading', { name: 'Scriptron' }) !== null
  const bigFishRecent = { ...bigFish, folder: '~/scripts' }

  beforeEach(async () => {
    recent = [bigFishRecent, { path: '/a/Other.fountain', name: 'Other.fountain', folder: '/a' }]
    await renderApp()
  })

  it('shows on launch with nothing to reopen, listing the recent documents', () => {
    expect(welcomeShown()).toBe(true)
    expect(document.title).toBe('Scriptron')
    expect(tabNames()).toEqual([])
    expect(sceneTitles()).toEqual(['Big Fish~/scripts', 'Other/a', 'Big Fish'])
  })

  it('opens a sample', () => {
    const samples = screen.getByRole('region', { name: 'Samples' })
    fireEvent.click(within(samples).getByRole('button', { name: 'Big Fish' }))
    expect(api.openSample).toHaveBeenCalledWith('Big Fish')
  })

  it('follows changes to the recent documents', () => {
    act(() => recentChanged([]))
    expect(screen.getByText('Scripts you open will be listed here.')).toBeTruthy()
  })

  it('opens a recent document, or asks which to open', () => {
    const recentList = screen.getByRole('region', { name: 'Recent' })
    fireEvent.click(within(recentList).getByRole('button', { name: /Big Fish/ }))
    expect(api.openPath).toHaveBeenCalledWith(bigFish.path)

    fireEvent.click(screen.getByRole('button', { name: 'Open…' }))
    expect(api.openDialog).toHaveBeenCalled()
  })

  it('shows an opened document in its only tab', () => {
    open({ ...bigFish, content: 'EXT. RIVER' })
    expect(welcomeShown()).toBe(false)
    expect(tabNames()).toEqual(['Big Fish'])
  })

  it('starts a new script from its button or the New command', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'New Script' }))
    expect(tabNames()).toEqual(['Untitled'])
    expect(editor().initialText).toBe(NEW_SCRIPT)

    await renderApp()
    command('new')
    expect(tabNames()).toEqual(['Untitled'])
  })

  it('ignores commands for a document', () => {
    command('save')
    command('export-pdf')
    command('close-tab')
    expect(api.saveFile).not.toHaveBeenCalled()
    expect(api.exportPdf).not.toHaveBeenCalled()
    expect(welcomeShown()).toBe(true)
  })

  it('shows again once the last tab is closed', async () => {
    open({ ...bigFish, content: 'EXT. RIVER' })
    await act(async () => command('close-tab'))
    expect(welcomeShown()).toBe(true)

    command('new')
    expect(tabNames()).toEqual(['Untitled'])
  })

  it('opens from the home button, keeping the tabs open, until a tab is chosen', () => {
    const home = (): HTMLElement => screen.getByRole('button', { name: 'Home' })
    expect(home().getAttribute('aria-pressed')).toBe('true')
    open({ ...bigFish, content: 'EXT. RIVER' })
    type('EXT. RIVER - DAY')
    expect(home().getAttribute('aria-pressed')).toBe('false')
    const mounted = mounts

    fireEvent.click(home())
    expect(welcomeShown()).toBe(true)
    expect(document.title).toBe('Scriptron')
    expect(tabNames()).toEqual(['Big Fish'])
    expect(screen.getByRole('tab', { selected: false }).textContent).toBe('Big Fish')
    // The document is still open, with its unsaved changes.
    expect(isDirty()).toBe(true)

    fireEvent.click(screen.getByRole('tab', { name: 'Big Fish' }))
    expect(welcomeShown()).toBe(false)
    expect(document.title).toBe('• Big Fish.fountain — Scriptron')
    // The same editor, with its undo history.
    expect(mounts).toBe(mounted)
  })

  it('opens a new script in a tab of its own, beside those already open', () => {
    open({ ...bigFish, content: 'EXT. RIVER' })
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    fireEvent.click(screen.getByRole('button', { name: 'New Script' }))
    expect(tabNames()).toEqual(['Big Fish', 'Untitled'])
    expect(selectedTab()).toBe('Untitled')
  })

  it('is not shown when the last launch’s tabs are reopened', async () => {
    restoredSession = { files: [{ ...bigFish, content: '' }], activePath: bigFish.path }
    await renderApp()
    expect(welcomeShown()).toBe(false)
    expect(tabNames()).toEqual(['Big Fish'])
  })
})

describe('App', () => {
  it('starts with a clean untitled document', () => {
    expect(document.title).toBe('Untitled — Scriptron')
    expect(editor().initialText).toBe(NEW_SCRIPT)
    expect(editor().initialCursor).toBe(NEW_SCRIPT_CURSOR)
    expect(isDirty()).toBe(false)
  })

  it('marks the document dirty when edited, and clean when edited back', () => {
    type('INT. HOUSE')
    expect(document.title).toBe('• Untitled — Scriptron')
    expect(isDirty()).toBe(true)

    type(NEW_SCRIPT)
    expect(document.title).toBe('Untitled — Scriptron')
    expect(isDirty()).toBe(false)
  })

  it('opens a file in a new tab, keeping the edited document in its own', () => {
    type('unsaved')
    open({ ...bigFish, content: 'EXT. RIVER' })

    expect(tabNames()).toEqual(['Untitled', 'Big Fish'])
    expect(selectedTab()).toBe('Big Fish')
    expect(editor().initialText).toBe('EXT. RIVER')
    expect(editor().initialCursor).toBe(0)
    expect(document.title).toBe('Big Fish.fountain — Scriptron')
    // The window still has unsaved changes, in the other tab.
    expect(isDirty()).toBe(true)
  })

  it('starts a new document in a new tab on the New command', () => {
    open({ ...bigFish, content: 'EXT. RIVER' })
    command('new')

    expect(tabNames()).toEqual(['Big Fish', 'Untitled'])
    expect(editor().initialText).toBe(NEW_SCRIPT)
    expect(editor().initialCursor).toBe(NEW_SCRIPT_CURSOR)
    expect(document.title).toBe('Untitled — Scriptron')
  })

  it('saves to the document’s path', async () => {
    open({ ...bigFish, content: 'EXT. RIVER' })
    type('EXT. RIVER - DAY')
    const finish = pendingSave()
    command('save')

    expect(api.saveFile).toHaveBeenCalledWith('EXT. RIVER - DAY', bigFish.path, 'Big Fish.fountain')
    await finish(bigFish)
    expect(isDirty()).toBe(false)
    // Saving keeps the editor (and its undo history and cursor).
    expect(mounts).toBe(2)
  })

  it('asks for a location when saving an untitled document, then uses its name', async () => {
    type('text')
    const finish = pendingSave()
    command('save')

    expect(api.saveFile).toHaveBeenCalledWith('text', null, 'Untitled.fountain')
    await finish(bigFish)
    expect(document.title).toBe('Big Fish.fountain — Scriptron')
    expect(isDirty()).toBe(false)
  })

  it('always asks for a location on Save As', async () => {
    open({ ...bigFish, content: 'text' })
    const finish = pendingSave()
    command('save-as')

    expect(api.saveFile).toHaveBeenCalledWith('text', null, 'Big Fish.fountain')
    await finish({ path: '/scripts/Copy.fountain', name: 'Copy.fountain' })
    expect(document.title).toBe('Copy.fountain — Scriptron')
  })

  it('stays dirty when the save is cancelled or fails', async () => {
    type('text')
    const finish = pendingSave()
    command('save')
    await finish(null)

    expect(document.title).toBe('• Untitled — Scriptron')
    expect(isDirty()).toBe(true)
  })

  it('stays dirty when the text changed while saving', async () => {
    type('first')
    const finish = pendingSave()
    command('save')
    type('second')
    await finish(bigFish)

    expect(document.title).toBe('• Big Fish.fountain — Scriptron')
    expect(isDirty()).toBe(true)
  })

  it('applies a save to its own tab when another tab is shown by the time it finishes', async () => {
    type('old document')
    const finish = pendingSave()
    command('save')

    open({ path: '/scripts/Other.fountain', name: 'Other.fountain', content: 'EXT. RIVER' })
    await finish(bigFish)

    expect(tabNames()).toEqual(['Big Fish', 'Other'])
    expect(document.title).toBe('Other.fountain — Scriptron')
    expect(isDirty()).toBe(false)
  })

  describe('tabs', () => {
    const other = { path: '/scripts/Other.fountain', name: 'Other.fountain' }

    it('opens a file in place of the blank untitled tab', () => {
      open({ ...bigFish, content: 'EXT. RIVER' })
      expect(tabNames()).toEqual(['Big Fish'])
    })

    it('shows a file that is already open rather than opening it twice', () => {
      open({ ...bigFish, content: 'EXT. RIVER' })
      open({ ...other, content: 'INT. HOUSE' })
      open({ ...bigFish, content: 'EXT. RIVER' })

      expect(tabNames()).toEqual(['Big Fish', 'Other'])
      expect(selectedTab()).toBe('Big Fish')
    })

    it('switches tabs when one is clicked, keeping each editor and its text', () => {
      open({ ...bigFish, content: 'EXT. RIVER' })
      open({ ...other, content: 'INT. HOUSE' })
      type('INT. HOUSE - DAY')
      fireEvent.click(screen.getByRole('tab', { name: 'Big Fish' }))

      expect(editor().initialText).toBe('EXT. RIVER')
      expect(document.title).toBe('Big Fish.fountain — Scriptron')
      expect(mounts).toBe(3)

      fireEvent.click(screen.getByRole('tab', { name: 'Other' }))
      expect(document.title).toBe('• Other.fountain — Scriptron')
      expect(mounts).toBe(3)
    })

    it('outlines the shown tab, and sends Find and scene jumps to its editor', () => {
      open({ ...bigFish, content: 'EXT. RIVER - DAY' })
      open({ ...other, content: 'INT. HOUSE - DAY\n\nEXT. GARDEN - DAY' })
      expect(sceneTitles()).toEqual(['1. INT. HOUSE - DAY', '2. EXT. GARDEN - DAY'])

      command('previous-tab')
      expect(sceneTitles()).toEqual(['1. EXT. RIVER - DAY'])
      command('find')
      expect(openSearch).toHaveBeenCalledWith('EXT. RIVER - DAY')
    })

    it('cycles through the tabs from the menu and with Ctrl+Tab', () => {
      open({ ...bigFish, content: '' })
      open({ ...other, content: '' })
      command('new')

      command('next-tab')
      expect(selectedTab()).toBe('Big Fish')
      command('previous-tab')
      expect(selectedTab()).toBe('Untitled')

      fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true })
      expect(selectedTab()).toBe('Big Fish')
      fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true, shiftKey: true })
      expect(selectedTab()).toBe('Untitled')
    })

    it('opens a new tab from its button, numbering untitled documents', () => {
      fireEvent.click(screen.getByRole('button', { name: 'New Document' }))
      expect(tabNames()).toEqual(['Untitled', 'Untitled 2'])
      expect(selectedTab()).toBe('Untitled 2')
    })

    it('closes a clean tab without asking, showing its neighbour', async () => {
      open({ ...bigFish, content: '' })
      open({ ...other, content: '' })
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Close Other' })))

      expect(api.confirmClose).not.toHaveBeenCalled()
      expect(tabNames()).toEqual(['Big Fish'])
      expect(document.title).toBe('Big Fish.fountain — Scriptron')
    })

    it('asks before closing a tab with unsaved changes', async () => {
      open({ ...bigFish, content: '' })
      type('edited')

      api.confirmClose.mockResolvedValueOnce(false)
      await act(async () => menuCommand('close-tab'))
      expect(api.confirmClose).toHaveBeenCalledWith('Big Fish.fountain')
      expect(tabNames()).toEqual(['Big Fish'])

      api.confirmClose.mockResolvedValueOnce(true)
      await act(async () => menuCommand('close-tab'))
      // Closing the last tab shows the welcome screen.
      expect(tabNames()).toEqual([])
      expect(screen.getByRole('heading', { name: 'Scriptron' })).toBeTruthy()
      expect(isDirty()).toBe(false)
    })

    it('reopens the files that were open at the last launch, showing the one that was shown', async () => {
      restoredSession = {
        files: [
          { ...bigFish, content: 'EXT. RIVER' },
          { ...other, content: 'INT. HOUSE' }
        ],
        activePath: bigFish.path
      }
      await renderApp()

      expect(tabNames()).toEqual(['Big Fish', 'Other'])
      expect(selectedTab()).toBe('Big Fish')
      expect(editor().initialText).toBe('EXT. RIVER')
    })

    it('remembers the open files, in order, and the shown one', () => {
      expect(api.saveSession).toHaveBeenLastCalledWith({ paths: [], activePath: null })

      open({ ...bigFish, content: '' })
      open({ ...other, content: '' })
      command('new')
      expect(api.saveSession).toHaveBeenLastCalledWith({
        paths: [bigFish.path, other.path],
        activePath: null
      })

      command('next-tab')
      expect(api.saveSession).toHaveBeenLastCalledWith({
        paths: [bigFish.path, other.path],
        activePath: bigFish.path
      })
    })

    it('does not remember anything until the last launch’s tabs are reopened', async () => {
      api.restoreSession.mockReturnValueOnce(new Promise(() => {}))
      api.saveSession.mockClear()
      await renderApp()
      open({ ...bigFish, content: '' })
      expect(api.saveSession).not.toHaveBeenCalled()
    })

    it('reorders tabs by dragging, once the pointer crosses the middle of another', () => {
      open({ ...bigFish, content: '' })
      open({ ...other, content: '' })
      command('new')
      // Each tab is 100px wide.
      const tabs = document.querySelectorAll<HTMLElement>('.tab')
      tabs.forEach((tab, i) => {
        tab.getBoundingClientRect = () => ({ left: i * 100, width: 100 }) as DOMRect
      })
      const dataTransfer = { effectAllowed: '', dropEffect: '' }
      // jsdom has no DragEvent, so the pointer position is set by hand.
      const dragOver = (tab: HTMLElement, clientX: number): void => {
        const event = createEvent.dragOver(tab, { dataTransfer })
        Object.defineProperty(event, 'clientX', { value: clientX })
        fireEvent(tab, event)
      }

      fireEvent.dragStart(tabs[0], { dataTransfer })
      dragOver(tabs[1], 140)
      expect(tabNames()).toEqual(['Big Fish', 'Other', 'Untitled'])

      dragOver(tabs[2], 260)
      expect(tabNames()).toEqual(['Other', 'Untitled', 'Big Fish'])
      // The dragged tab is shown.
      expect(selectedTab()).toBe('Big Fish')
      fireEvent.dragEnd(tabs[0], { dataTransfer })
    })

    it('marks tabs with unsaved changes', () => {
      type('edited')
      expect(screen.getByRole('tab', { name: 'Untitled' }).parentElement?.className).toContain(
        'tab-dirty'
      )
    })
  })

  it('exports a PDF of the print view, titled after the screenplay', async () => {
    open({ ...bigFish, content: 'Title: Big Fish\n\nEXT. RIVER - DAY' })
    let finish!: (written: boolean) => void
    api.exportPdf.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    await act(async () => menuCommand('export-pdf'))

    expect(api.exportPdf).toHaveBeenCalledWith('Big Fish.pdf')
    expect(document.title).toBe('Big Fish')
    expect(document.querySelector('.print')?.textContent).toContain('EXT. RIVER - DAY')

    await act(async () => finish(true))
    expect(document.querySelector('.print')).toBeNull()
    expect(document.title).toBe('Big Fish.fountain — Scriptron')
  })

  describe('PDF preview', () => {
    const preview = (): HTMLElement | null => screen.queryByRole('dialog', { name: 'PDF Preview' })

    beforeEach(() => {
      open({
        ...bigFish,
        content: 'Title: Big Fish\n\nEXT. RIVER - DAY\n\n===\n\nINT. HOUSE - NIGHT'
      })
      command('preview-pdf')
    })

    it('shows the printed pages, with a thumbnail of each', () => {
      const pages = within(preview()!).getByRole('navigation', { name: 'Pages' })
      expect(
        within(pages)
          .getAllByRole('button')
          .map((button) => button.getAttribute('aria-label'))
      ).toEqual(['Title page', 'Page 1', 'Page 2'])
      expect(within(pages).getByRole('button', { name: 'Title page' })).toHaveProperty(
        'ariaCurrent',
        'page'
      )
      expect(preview()?.textContent).toContain('EXT. RIVER - DAY')
      expect(preview()?.textContent).toContain('INT. HOUSE - NIGHT')
    })

    it("opens from the toolbar's button", () => {
      command('preview-pdf')
      expect(preview()).toBeNull()
      act(() => editor().onPreviewPdf())
      expect(preview()).not.toBeNull()
    })

    it('follows the shown document as it changes', () => {
      type('Title: Big Fish\n\nEXT. LAKE - DAY')
      expect(preview()?.textContent).toContain('EXT. LAKE - DAY')
    })

    it('closes with the close button, Escape or the menu command again', () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close Preview' }))
      expect(preview()).toBeNull()
      command('preview-pdf')
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(preview()).toBeNull()
      command('preview-pdf')
      command('preview-pdf')
      expect(preview()).toBeNull()
    })

    it('exports the PDF', async () => {
      api.exportPdf.mockResolvedValueOnce(true)
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export PDF…' })))
      expect(api.exportPdf).toHaveBeenCalledWith('Big Fish.pdf')
      expect(preview()).not.toBeNull()
    })

    it('closes when the last tab does, and stays closed', async () => {
      api.confirmClose.mockResolvedValue(true)
      // The untitled document, then Big Fish.
      await act(async () => menuCommand('close-tab'))
      await act(async () => menuCommand('close-tab'))
      expect(screen.queryByRole('tab')).toBeNull()
      command('new')
      expect(preview()).toBeNull()
    })
  })

  describe('sidebar', () => {
    const script = 'INT. HOUSE - DAY\n\nAction.\n\nEXT. RIVER - NIGHT\n\nWater.'

    it('lists the scenes, following edits', () => {
      open({ ...bigFish, content: script })
      expect(sceneTitles()).toEqual(['1. INT. HOUSE - DAY', '2. EXT. RIVER - NIGHT'])

      type(`${script}\n\nEXT. CAMPFIRE - NIGHT\n\nFire.`)
      expect(sceneTitles()).toHaveLength(3)
    })

    it('jumps to a scene when it is clicked', () => {
      open({ ...bigFish, content: script })
      fireEvent.click(screen.getByText(/EXT\. RIVER/))
      expect(goToLine).toHaveBeenCalledWith(4)
    })

    it('highlights the scene the cursor is in', () => {
      open({ ...bigFish, content: script })
      act(() => editor().onCursorLine(6))
      expect(screen.getByRole('button', { current: true }).textContent).toBe(
        '2. EXT. RIVER - NIGHT'
      )
    })

    it('filters scenes by search, and jumps to the first match on Enter', () => {
      open({ ...bigFish, content: script })
      const search = screen.getByRole('searchbox', { name: 'Search scenes' })
      fireEvent.change(search, { target: { value: 'night' } })
      expect(sceneTitles()).toEqual(['2. EXT. RIVER - NIGHT'])

      fireEvent.keyDown(search, { key: 'Enter' })
      expect(goToLine).toHaveBeenCalledWith(4)

      fireEvent.keyDown(search, { key: 'Escape' })
      expect(sceneTitles()).toHaveLength(2)
    })

    // jsdom has no layout, so every drop lands in the lower half of the scene under the pointer.
    const dragScene = (from: RegExp, onto: RegExp): Promise<void> =>
      act(async () => {
        const item = (text: RegExp): HTMLElement => screen.getByText(text).closest('li')!
        const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
        fireEvent.dragStart(item(from), { dataTransfer })
        // jsdom has no DragEvent, so the pointer position is set on the event itself.
        for (const type of ['dragOver', 'drop'] as const) {
          const event = createEvent[type](item(onto), { dataTransfer })
          Object.defineProperty(event, 'clientY', { value: 1 })
          fireEvent(item(onto), event)
        }
        fireEvent.dragEnd(item(from), { dataTransfer })
      })

    it('moves a dragged scene once confirmed', async () => {
      open({ ...bigFish, content: script })
      api.confirmMoveScene.mockResolvedValueOnce(true)
      await dragScene(/INT\. HOUSE/, /EXT\. RIVER/)

      expect(api.confirmMoveScene).toHaveBeenCalledWith({
        scene: '1. INT. HOUSE - DAY',
        target: '2. EXT. RIVER - NIGHT',
        after: true
      })
      expect(replaceText).toHaveBeenCalledWith(
        'EXT. RIVER - NIGHT\n\nWater.\n\nINT. HOUSE - DAY\n\nAction.'
      )
      expect(goToLine).toHaveBeenLastCalledWith(4)
    })

    it('leaves the scenes as they are when the move is cancelled', async () => {
      open({ ...bigFish, content: script })
      api.confirmMoveScene.mockResolvedValueOnce(false)
      await dragScene(/INT\. HOUSE/, /EXT\. RIVER/)

      expect(api.confirmMoveScene).toHaveBeenCalled()
      expect(replaceText).not.toHaveBeenCalled()
    })

    it('does not ask when a scene is dropped where it already is', async () => {
      open({ ...bigFish, content: script })
      await dragScene(/EXT\. RIVER/, /EXT\. RIVER/)
      expect(api.confirmMoveScene).not.toHaveBeenCalled()
    })

    it('collapses and expands, from its button and the menu', () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hide Sidebar' }))
      expect(screen.queryByRole('complementary')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Show Sidebar' }))
      expect(screen.getByRole('complementary', { name: 'Scenes' })).toBeTruthy()

      command('toggle-sidebar')
      expect(screen.queryByRole('complementary')).toBeNull()
    })

    it('resizes from its edge, and resets on double-click', () => {
      const sidebar = screen.getByRole('complementary', { name: 'Scenes' })
      const edge = screen.getByRole('separator', { name: 'Resize Sidebar' })

      // jsdom has no layout, so the sidebar measures 0 and is clamped to the minimum.
      fireEvent.keyDown(edge, { key: 'ArrowRight' })
      expect(sidebar.style.flexBasis).toBe('160px')
      expect(localStorage.getItem('sidebar-width')).toBe('160')

      fireEvent.doubleClick(edge)
      expect(sidebar.style.flexBasis).toBe('')
      expect(localStorage.getItem('sidebar-width')).toBeNull()
    })
  })

  it('opens the editor search from the Find menu item', () => {
    command('find')
    expect(openSearch).toHaveBeenCalledOnce()
  })

  describe('settings', () => {
    const dialog = (): HTMLElement | null => screen.queryByRole('dialog', { name: 'Settings' })
    const changeSettings = (changes: Partial<Settings>): void =>
      act(() => settingsChanged({ ...defaultSettings, ...changes }))

    it('opens from the menu, and closes with Done or Escape', () => {
      command('open-settings')
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      expect(dialog()).toBeNull()

      command('open-settings')
      fireEvent.keyDown(dialog()!, { key: 'Escape' })
      expect(dialog()).toBeNull()
    })

    it('sends changes to the main process', () => {
      command('open-settings')
      fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
      expect(api.updateSettings).toHaveBeenLastCalledWith({ appearance: 'dark' })

      fireEvent.change(screen.getByLabelText('Interface text size'), { target: { value: '16' } })
      expect(api.updateSettings).toHaveBeenLastCalledWith({ uiFontSize: 16 })

      fireEvent.change(screen.getByLabelText('Screenplay text size'), { target: { value: '14' } })
      expect(api.updateSettings).toHaveBeenLastCalledWith({ editorFontSize: 14 })
    })

    it('applies the settings it is sent', () => {
      command('open-settings')
      changeSettings({ appearance: 'light', uiFontSize: 18, editorFontSize: 16 })

      expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Light' }).checked).toBe(true)
      expect(document.documentElement.style.getPropertyValue('--ui-font-size')).toBe('18px')
      expect(editor().fontSize).toBe(16)
      // The editor is reconfigured, not remounted.
      expect(mounts).toBe(1)
    })

    it('turns spell checking on and off', () => {
      expect(editor().checkSpelling).toBe(true)
      command('open-settings')
      fireEvent.click(screen.getByRole('checkbox', { name: 'Check spelling while typing' }))
      expect(api.updateSettings).toHaveBeenLastCalledWith({ checkSpelling: false })
      changeSettings({ checkSpelling: false })
      expect(editor().checkSpelling).toBe(false)
    })

    it('adds words to the dictionary and removes them', async () => {
      await act(async () => {})
      command('open-settings')
      fireEvent.change(screen.getByRole('textbox', { name: 'New word' }), {
        target: { value: ' Jaxxon  Zorg ' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      expect(api.updateSettings).toHaveBeenLastCalledWith({ dictionary: ['Jaxxon', 'Zorg'] })

      changeSettings({ dictionary: ['Jaxxon', 'Zorg'] })
      fireEvent.click(screen.getByRole('button', { name: 'Remove Jaxxon' }))
      expect(api.updateSettings).toHaveBeenLastCalledWith({ dictionary: ['Zorg'] })
    })
  })
})
