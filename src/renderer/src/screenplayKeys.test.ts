// @vitest-environment jsdom
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { endSpeech } from './screenplayKeys'

// The document after pressing Enter with the cursor at "|", or null if Enter is left alone.
const enter = (text: string): string | null => {
  const view = new EditorView({ doc: text.replace('|', '') })
  view.dispatch({ selection: { anchor: text.indexOf('|') } })
  const handled = endSpeech(view)
  const result = view.state.doc.toString()
  const head = view.state.selection.main.head
  view.destroy()
  return handled ? `${result.slice(0, head)}|${result.slice(head)}` : null
}

describe('endSpeech', () => {
  it('ends a speech with a blank line, ready for the next character', () => {
    expect(enter('BOB\nHello.|')).toBe('BOB\nHello.\n\n|')
    expect(enter('BOB\nHello.|\n\nAction.')).toBe('BOB\nHello.\n\n|\n\nAction.')
  })

  it('leaves Enter alone elsewhere', () => {
    expect(enter('BOB|\nHello.')).toBeNull()
    expect(enter('BOB\nHel|lo.')).toBeNull()
    expect(enter('BOB\nHello.|\nMore.')).toBeNull()
    expect(enter('BOB\n(quietly)|')).toBeNull()
    expect(enter('Action.|')).toBeNull()
  })
})
