// @vitest-environment jsdom
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { activeEmphasis, type Emphasis, toggleEmphasis } from './emphasis'

// Marks the selection with "[" and "]", or the cursor with "|".
function stateOf(text: string): EditorState {
  const cursor = text.indexOf('|')
  if (cursor >= 0) {
    return EditorState.create({ doc: text.replace('|', ''), selection: { anchor: cursor } })
  }
  const from = text.indexOf('[')
  const to = text.indexOf(']') - 1
  return EditorState.create({
    doc: text.replace('[', '').replace(']', ''),
    selection: { anchor: from, head: to }
  })
}

function show(state: EditorState): string {
  const { from, to, empty } = state.selection.main
  const text = state.doc.toString()
  return empty
    ? `${text.slice(0, from)}|${text.slice(from)}`
    : `${text.slice(0, from)}[${text.slice(from, to)}]${text.slice(to)}`
}

// The document and selection after toggling style.
function toggle(text: string, style: Emphasis): string {
  const view = new EditorView({ state: stateOf(text) })
  toggleEmphasis(style)(view)
  const result = show(view.state)
  view.destroy()
  return result
}

describe('toggleEmphasis', () => {
  it('wraps the selected text, keeping it selected', () => {
    expect(toggle('Bob [runs] home.', 'bold')).toBe('Bob **[runs]** home.')
    expect(toggle('Bob [runs] home.', 'italic')).toBe('Bob *[runs]* home.')
    expect(toggle('Bob [runs] home.', 'underline')).toBe('Bob _[runs]_ home.')
    expect(toggle('Bob [runs] home.', 'note')).toBe('Bob [[[runs]]] home.')
  })

  it('leaves surrounding whitespace outside the markup', () => {
    expect(toggle('Bob[ runs ]home.', 'bold')).toBe('Bob[ **runs** ]home.')
  })

  it('wraps each line of a selection spanning lines', () => {
    expect(toggle('[One.\n\nTwo.]', 'italic')).toBe('*[One.*\n\n*Two.]*')
  })

  it('removes the style when the selection already has it', () => {
    expect(toggle('Bob **[runs]** home.', 'bold')).toBe('Bob [runs] home.')
    expect(toggle('Bob [**runs**] home.', 'bold')).toBe('Bob [runs] home.')
    expect(toggle('Bob **r[un]s** home.', 'bold')).toBe('Bob r[un]s home.')
    expect(toggle('Bob [[[runs]]] home.', 'note')).toBe('Bob [runs] home.')
  })

  it('removes only one style of bold italic text', () => {
    expect(toggle('***[runs]***', 'bold')).toBe('*[runs]*')
    expect(toggle('***[runs]***', 'italic')).toBe('**[runs]**')
  })

  it('adds a style to text that has another', () => {
    expect(toggle('**[runs]**', 'italic')).toBe('***[runs]***')
  })

  it('gives a cursor delimiters to type between, or removes the style it is in', () => {
    expect(toggle('Bob |', 'bold')).toBe('Bob **|**')
    expect(toggle('Bob **ru|ns**', 'bold')).toBe('Bob ru|ns')
  })
})

describe('activeEmphasis', () => {
  const active = (text: string): Emphasis[] => [...activeEmphasis(stateOf(text))].sort()

  it('lists the styles at the selection', () => {
    expect(active('Bob ***r|uns***')).toEqual(['bold', 'italic'])
    expect(active('Bob _[runs]_ [[note]]')).toEqual(['underline'])
    expect(active('Bob [[no|te]]')).toEqual(['note'])
    expect(active('Bob |**runs**')).toEqual([])
    expect(active('[**One.**\n\nTwo.]')).toEqual([])
  })
})
