import { Prec, type Extension } from '@codemirror/state'
import { type EditorView, keymap } from '@codemirror/view'
import { classifyLines, isCharacterName } from './lib/fountainLines'
import { uppercaseHeading } from './lib/sceneHeadings'

// Like Beat: Enter at the end of a speech, a scene heading or an action line also adds the blank
// line Fountain needs after it, so the next element can be typed right away, and puts a scene
// heading in capitals. Shift-Enter adds a single line.
export function endBlock(view: EditorView): boolean {
  const { state } = view
  const { main } = state.selection
  if (state.selection.ranges.length > 1 || !main.empty) return false

  const line = state.doc.lineAt(main.head)
  if (main.head !== line.to || line.text.trim() === '') return false
  // Only at the end of the block, not when inserting a line in the middle of one.
  if (line.number < state.doc.lines && state.doc.line(line.number + 1).text.trim() !== '') {
    return false
  }

  const types = classifyLines(state.doc.toJSON())
  const type = types[line.number - 1]
  if (type !== 'dialogue' && type !== 'scene-heading' && type !== 'action') return false
  // A character name reads as action until its speech is typed, so it gets a single line.
  const blankBefore = line.number === 1 || state.doc.line(line.number - 1).text.trim() === ''
  const trimmed = line.text.trim()
  if (type === 'action' && blankBefore && (trimmed.startsWith('@') || isCharacterName(trimmed))) {
    return false
  }

  // Scene headings are written in capitals, like the editor shows them.
  const from = type === 'scene-heading' ? line.from : line.to
  const insert = `${type === 'scene-heading' ? uppercaseHeading(line.text) : ''}\n\n`
  view.dispatch({
    changes: { from, to: line.to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
    userEvent: 'input'
  })
  return true
}

function newLine(view: EditorView): boolean {
  view.dispatch(view.state.replaceSelection('\n'), { scrollIntoView: true, userEvent: 'input' })
  return true
}

export function screenplayKeys(): Extension {
  return Prec.high(
    keymap.of([
      { key: 'Enter', run: endBlock },
      { key: 'Shift-Enter', run: newLine }
    ])
  )
}
