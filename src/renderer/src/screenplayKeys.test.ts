// @vitest-environment jsdom
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { endBlock } from './screenplayKeys'

// The document after pressing Enter with the cursor at "|", or null if Enter is left alone.
const enter = (text: string): string | null => {
  const view = new EditorView({ doc: text.replace('|', '') })
  view.dispatch({ selection: { anchor: text.indexOf('|') } })
  const handled = endBlock(view)
  const result = view.state.doc.toString()
  const head = view.state.selection.main.head
  view.destroy()
  return handled ? `${result.slice(0, head)}|${result.slice(head)}` : null
}

describe('endBlock', () => {
  it('ends a speech with a blank line, ready for the next character', () => {
    expect(enter('BOB\nHello.|')).toBe('BOB\nHello.\n\n|')
    expect(enter('BOB\nHello.|\n\nAction.')).toBe('BOB\nHello.\n\n|\n\nAction.')
  })

  it('ends a scene heading with a blank line', () => {
    expect(enter('INT. HOUSE - DAY|')).toBe('INT. HOUSE - DAY\n\n|')
    expect(enter('Action.\n\n.FLASHBACK|')).toBe('Action.\n\n.FLASHBACK\n\n|')
  })

  it('ends an action line with a blank line', () => {
    expect(enter('Action.|')).toBe('Action.\n\n|')
    expect(enter('INT. HOUSE\n\nBob sits.|')).toBe('INT. HOUSE\n\nBob sits.\n\n|')
  })

  it('leaves Enter alone elsewhere', () => {
    expect(enter('BOB|\nHello.')).toBeNull()
    expect(enter('BOB\nHel|lo.')).toBeNull()
    expect(enter('BOB\nHello.|\nMore.')).toBeNull()
    expect(enter('BOB\n(quietly)|')).toBeNull()
    expect(enter('Action.\n\nBOB|')).toBeNull()
    expect(enter('Action.\n\n@McCLANE|')).toBeNull()
    expect(enter('INT. HOUSE|\nAction.')).toBeNull()
  })
})
