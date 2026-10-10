import { Prec, type Extension } from '@codemirror/state'
import { type EditorView, keymap } from '@codemirror/view'
import { classifyLines } from './lib/fountainLines'

// Like Beat: Enter at the end of a speech also adds the blank line that ends it, so the next
// character's name can be typed right away. Shift-Enter adds a line within the speech.
export function endSpeech(view: EditorView): boolean {
  const { state } = view
  const { main } = state.selection
  if (state.selection.ranges.length > 1 || !main.empty) return false

  const line = state.doc.lineAt(main.head)
  if (main.head !== line.to || line.text.trim() === '') return false
  // Only at the end of the speech, not when inserting a line in the middle of one.
  if (line.number < state.doc.lines && state.doc.line(line.number + 1).text.trim() !== '') {
    return false
  }

  const types = classifyLines(state.doc.toJSON())
  if (types[line.number - 1] !== 'dialogue') return false

  view.dispatch(state.replaceSelection('\n\n'), { scrollIntoView: true, userEvent: 'input' })
  return true
}

function newLine(view: EditorView): boolean {
  view.dispatch(view.state.replaceSelection('\n'), { scrollIntoView: true, userEvent: 'input' })
  return true
}

export function screenplayKeys(): Extension {
  return Prec.high(
    keymap.of([
      { key: 'Enter', run: endSpeech },
      { key: 'Shift-Enter', run: newLine }
    ])
  )
}
