import { type ChangeSpec, type EditorState, EditorSelection, type Line } from '@codemirror/state'
import type { Command, EditorView } from '@codemirror/view'
import { classifyLines } from './lib/fountainLines'

// The non-blank lines touched by the main selection, or the cursor's line.
function selectedLines(state: EditorState): Line[] {
  const { from, to } = state.selection.main
  const lines: Line[] = []
  for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++) {
    lines.push(state.doc.line(n))
  }
  const filled = lines.filter((line) => line.text.trim() !== '')
  return filled.length > 0 ? filled : lines.slice(0, 1)
}

// Whether every selected line is centered text (> like this <).
export function isCentered(state: EditorState): boolean {
  const types = classifyLines(state.doc.toJSON())
  return selectedLines(state).every((line) => types[line.number - 1] === 'centered')
}

// Centers the selected lines with "> " and " <", or removes them if all are centered already.
// On a blank line it leaves the cursor between the markers, ready to type.
export const toggleCentered: Command = (view: EditorView): boolean => {
  const { state } = view
  const lines = selectedLines(state)
  const centered = isCentered(state)
  let changes: ChangeSpec[]

  if (centered) {
    changes = lines.map((line) => {
      const open = /^\s*>\s*/.exec(line.text)![0].length
      const close = /\s*<\s*$/.exec(line.text)!
      return [
        { from: line.from, to: line.from + open },
        { from: line.from + close.index, to: line.to }
      ]
    })
  } else if (lines.length === 1 && lines[0].text.trim() === '') {
    const { from, to } = lines[0]
    view.dispatch({
      changes: { from, to, insert: '>  <' },
      selection: { anchor: from + 2 },
      scrollIntoView: true,
      userEvent: 'input'
    })
    return true
  } else {
    const types = classifyLines(state.doc.toJSON())
    changes = lines
      .filter((line) => types[line.number - 1] !== 'centered')
      // Only the ends change, so the cursor keeps its place in the text. A transition's ">"
      // becomes the opening marker.
      .map((line) => [
        { from: line.from, to: line.from + /^\s*(>\s*)?/.exec(line.text)![0].length, insert: '> ' },
        { from: line.from + line.text.trimEnd().length, to: line.to, insert: ' <' }
      ])
  }

  view.dispatch({ changes, scrollIntoView: true, userEvent: 'input' })
  return true
}

// Adds a page break (===) after the cursor's line, with the blank lines Fountain needs around it,
// and leaves the cursor below it to go on typing.
export const insertPageBreak: Command = (view: EditorView): boolean => {
  const { state } = view
  const { doc } = state
  const line = doc.lineAt(state.selection.main.to)
  const at = line.text.trim() === '' ? line.from : line.to

  // Replaces the blank lines around that point, so the break is never surrounded by extra ones.
  const from = doc.sliceString(0, at).trimEnd().length
  const after = doc.sliceString(at)
  const space = /^\s*/.exec(after)![0]
  const to = space === after ? doc.length : at + space.lastIndexOf('\n') + 1

  const before = from > 0 ? '\n\n' : ''
  const following = to < doc.length ? '\n\n' : ''
  const insert = `${before}===\n\n${following}`
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + before.length + '===\n\n'.length),
    scrollIntoView: true,
    userEvent: 'input'
  })
  return true
}
