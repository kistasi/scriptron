// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api } from '../../preload'
import type { MenuCommand, OpenedFile, SavedFile } from '../../shared/ipc'
import App from './App'

// The real editor needs a browser layout engine; this stand-in shows the loaded text and
// exposes onChange so tests can type.
let editor: { initialText: string; onChange: (text: string) => void; mounts: number }
vi.mock('./Editor', async () => {
  const { useEffect } = await import('react')
  return {
    Editor: (props: { initialText: string; onChange: (text: string) => void }) => {
      editor = { ...props, mounts: editor?.mounts ?? 0 }
      useEffect(() => {
        editor.mounts++
      }, [])
      return null
    }
  }
})

let fileOpened: (file: OpenedFile) => void
let menuCommand: (command: MenuCommand) => void
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

beforeEach(() => {
  editor = undefined as never
  api = {
    onFileOpened: vi.fn((callback) => ((fileOpened = callback), () => {})),
    onMenuCommand: vi.fn((callback) => ((menuCommand = callback), () => {})),
    saveFile: vi.fn(),
    setDirty: vi.fn(),
    exportPdf: vi.fn()
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

    expect(api.saveFile).toHaveBeenCalledWith('EXT. RIVER - DAY', bigFish.path)
    await finish(bigFish)
    expect(isDirty()).toBe(false)
    // Saving keeps the editor (and its undo history and cursor).
    expect(editor.mounts).toBe(2)
  })

  it('asks for a location when saving an untitled document, then uses its name', async () => {
    type('text')
    const finish = pendingSave()
    command('save')

    expect(api.saveFile).toHaveBeenCalledWith('text', null)
    await finish(bigFish)
    expect(document.title).toBe('Big Fish.fountain — scriptron')
    expect(isDirty()).toBe(false)
  })

  it('always asks for a location on Save As', async () => {
    open({ ...bigFish, content: 'text' })
    const finish = pendingSave()
    command('save-as')

    expect(api.saveFile).toHaveBeenCalledWith('text', null)
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
})
