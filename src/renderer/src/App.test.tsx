// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api } from '../../preload'
import {
  defaultSettings,
  type MenuCommand,
  type OpenedFile,
  type SavedFile,
  type Settings
} from '../../shared/ipc'
import App from './App'

// The real editor needs a browser layout engine; this stand-in shows the loaded text, exposes
// onChange and onCursorLine so tests can type and move the cursor, and records goToLine and
// openSearch calls.
interface EditorProps {
  initialText: string
  fontSize: number
  checkSpelling: boolean
  onChange: (text: string) => void
  onCursorLine: (line: number) => void
  ref: React.Ref<{ goToLine: (line: number) => void; openSearch: () => void }>
}
let editor: Omit<EditorProps, 'ref'> & { mounts: number }
const goToLine = vi.fn()
const openSearch = vi.fn()
vi.mock('./Editor', async () => {
  const { useEffect, useImperativeHandle } = await import('react')
  return {
    Editor: ({ ref, ...props }: EditorProps) => {
      editor = { ...props, mounts: editor?.mounts ?? 0 }
      useImperativeHandle(ref, () => ({ goToLine, openSearch }))
      useEffect(() => {
        editor.mounts++
      }, [])
      return null
    }
  }
})

// jsdom doesn't lay out, so there is nothing to scroll.
Element.prototype.scrollIntoView = () => {}

let fileOpened: (file: OpenedFile) => void
let menuCommand: (command: MenuCommand) => void
let settingsChanged: (settings: Settings) => void
let api: { [K in keyof Api]: ReturnType<typeof vi.fn> }

// A save that the test resolves when it chooses, like a save dialog left open.
function pendingSave(): (result: SavedFile | null) => Promise<void> {
  let resolve!: (result: SavedFile | null) => void
  api.saveFile.mockReturnValueOnce(new Promise((r) => (resolve = r)))
  return (result) => act(async () => resolve(result))
}

const type = (text: string): void => act(() => editor.onChange(text))
const command = (name: MenuCommand): void => act(() => menuCommand(name))
const open = (file: OpenedFile): void => act(() => fileOpened(file))
const isDirty = (): boolean => api.setDirty.mock.lastCall?.[0]

const bigFish = { path: '/scripts/Big Fish.fountain', name: 'Big Fish.fountain' }

const sceneTitles = (): string[] =>
  screen.queryAllByRole('listitem').map((item) => item.textContent ?? '')

beforeEach(() => {
  editor = undefined as never
  goToLine.mockClear()
  openSearch.mockClear()
  localStorage.clear()
  api = {
    onFileOpened: vi.fn((callback) => ((fileOpened = callback), () => {})),
    onMenuCommand: vi.fn((callback) => ((menuCommand = callback), () => {})),
    saveFile: vi.fn(),
    setDirty: vi.fn(),
    exportPdf: vi.fn(),
    getSettings: vi.fn(() => Promise.resolve(defaultSettings)),
    updateSettings: vi.fn(),
    onSettingsChanged: vi.fn((callback) => ((settingsChanged = callback), () => {}))
  }
  window.api = api as unknown as Api
  render(<App />)
})

afterEach(cleanup)

describe('App', () => {
  it('starts with a clean untitled document', () => {
    expect(document.title).toBe('Untitled — scriptron')
    expect(editor.initialText).toBe('')
    expect(isDirty()).toBe(false)
  })

  it('marks the document dirty when edited, and clean when edited back', () => {
    type('INT. HOUSE')
    expect(document.title).toBe('• Untitled — scriptron')
    expect(isDirty()).toBe(true)

    type('')
    expect(document.title).toBe('Untitled — scriptron')
    expect(isDirty()).toBe(false)
  })

  it('loads an opened file into a fresh editor', () => {
    type('unsaved')
    open({ ...bigFish, content: 'EXT. RIVER' })

    expect(editor.initialText).toBe('EXT. RIVER')
    expect(editor.mounts).toBe(2)
    expect(document.title).toBe('Big Fish.fountain — scriptron')
    expect(isDirty()).toBe(false)
  })

  it('starts a new document on the New command', () => {
    open({ ...bigFish, content: 'EXT. RIVER' })
    command('new')

    expect(editor.initialText).toBe('')
    expect(document.title).toBe('Untitled — scriptron')
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
    expect(editor.mounts).toBe(2)
  })

  it('asks for a location when saving an untitled document, then uses its name', async () => {
    type('text')
    const finish = pendingSave()
    command('save')

    expect(api.saveFile).toHaveBeenCalledWith('text', null, 'Untitled.fountain')
    await finish(bigFish)
    expect(document.title).toBe('Big Fish.fountain — scriptron')
    expect(isDirty()).toBe(false)
  })

  it('always asks for a location on Save As', async () => {
    open({ ...bigFish, content: 'text' })
    const finish = pendingSave()
    command('save-as')

    expect(api.saveFile).toHaveBeenCalledWith('text', null, 'Big Fish.fountain')
    await finish({ path: '/scripts/Copy.fountain', name: 'Copy.fountain' })
    expect(document.title).toBe('Copy.fountain — scriptron')
  })

  it('stays dirty when the save is cancelled or fails', async () => {
    type('text')
    const finish = pendingSave()
    command('save')
    await finish(null)

    expect(document.title).toBe('• Untitled — scriptron')
    expect(isDirty()).toBe(true)
  })

  it('stays dirty when the text changed while saving', async () => {
    type('first')
    const finish = pendingSave()
    command('save')
    type('second')
    await finish(bigFish)

    expect(document.title).toBe('• Big Fish.fountain — scriptron')
    expect(isDirty()).toBe(true)
  })

  it('ignores a save that finishes after another document was loaded', async () => {
    type('old document')
    const finish = pendingSave()
    command('save')

    open({ path: '/scripts/Other.fountain', name: 'Other.fountain', content: 'EXT. RIVER' })
    await finish(bigFish)

    // Neither the saved name nor the saved text is applied to the newly opened file.
    expect(document.title).toBe('Other.fountain — scriptron')
    expect(isDirty()).toBe(false)
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
    expect(document.title).toBe('Big Fish.fountain — scriptron')
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
      act(() => editor.onCursorLine(6))
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

    it('collapses and expands, from its button and the menu', () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hide Sidebar' }))
      expect(screen.queryByRole('complementary')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Show Sidebar' }))
      expect(screen.getByRole('complementary', { name: 'Scenes' })).toBeTruthy()

      command('toggle-sidebar')
      expect(screen.queryByRole('complementary')).toBeNull()
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
      expect(editor.fontSize).toBe(16)
      // The editor is reconfigured, not remounted.
      expect(editor.mounts).toBe(1)
    })

    it('turns spell checking on and off', () => {
      expect(editor.checkSpelling).toBe(true)
      command('open-settings')
      fireEvent.click(screen.getByRole('checkbox', { name: 'Check spelling while typing' }))
      expect(api.updateSettings).toHaveBeenLastCalledWith({ checkSpelling: false })
      changeSettings({ checkSpelling: false })
      expect(editor.checkSpelling).toBe(false)
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
