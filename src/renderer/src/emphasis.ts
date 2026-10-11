import {
  ChangeSet,
  type ChangeSpec,
  type EditorState,
  EditorSelection,
  type Extension,
  type SelectionRange
} from '@codemirror/state'
import { type Command, type EditorView, keymap } from '@codemirror/view'
import { classifiedDoc } from './classifiedDoc'
import { inlineRanges, type LineType } from './lib/fountainLines'

export type Emphasis = 'bold' | 'italic' | 'underline' | 'note'

// The Fountain markup around emphasized text.
const delimiters: Record<Emphasis, [string, string]> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  underline: ['_', '_'],
  note: ['[[', ']]']
}

interface Segment {
  // Document positions of the selected text on one line, without surrounding whitespace.
  from: number
  to: number
  // The emphasized range (with its delimiters) containing the text, if there is one.
  styled?: { from: number; to: number }
}

// The selected text on each line of a range; a cursor gives one empty segment.
function segments(
  state: EditorState,
  types: readonly LineType[],
  range: SelectionRange,
  style: Emphasis
): Segment[] {
  const result: Segment[] = []
  const first = state.doc.lineAt(range.from).number
  const last = state.doc.lineAt(range.to).number

  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n)
    let from = Math.max(range.from, line.from)
    let to = Math.min(range.to, line.to)
    if (!range.empty) {
      const text = state.doc.sliceString(from, to)
      if (text.trim() === '') continue
      from += text.length - text.trimStart().length
      to -= text.length - text.trimEnd().length
    }

    // A cursor counts as inside when it is between the delimiters, or touching them.
    const styled = inlineRanges(line.text, types[n - 1])
      .filter((r) => r.style === style)
      .map((r) => ({ from: line.from + r.from, to: line.from + r.to }))
      .find((r) => (range.empty ? r.from < from && to < r.to : r.from <= from && to <= r.to))
    result.push({ from, to, styled })
  }
  return result
}

// The styles applied at the main selection, for showing toolbar buttons as pressed.
export function activeEmphasis(state: EditorState): Set<Emphasis> {
  const range = state.selection.main
  const { types } = classifiedDoc(state.doc)
  const active = new Set<Emphasis>()
  for (const style of Object.keys(delimiters) as Emphasis[]) {
    const found = segments(state, types, range, style)
    if (found.length > 0 && found.every((segment) => segment.styled)) active.add(style)
  }
  return active
}

// Wraps the selected text in the style's markup, or removes it if all the text already has it.
// A cursor gets an empty pair of delimiters to type between, or leaves the style it is in.
export function toggleEmphasis(style: Emphasis): Command {
  const [open, close] = delimiters[style]
  return (view: EditorView): boolean => {
    const { state } = view
    const { types } = classifiedDoc(state.doc)
    const transaction = state.changeByRange((range) => {
      const found = segments(state, types, range, style)
      if (found.length === 0) return { range }

      if (found.every((segment) => segment.styled)) {
        // Only the style's own delimiters, so that ***both*** loses just the bold or the italic.
        const changes: ChangeSpec[] = found.map(({ styled }) => [
          { from: styled!.from, to: styled!.from + open.length },
          { from: styled!.to - close.length, to: styled!.to }
        ])
        const set = ChangeSet.of(changes, state.doc.length)
        return { changes: set, range: range.map(set) }
      }

      if (range.empty) {
        return {
          changes: { from: range.head, insert: open + close },
          range: EditorSelection.cursor(range.head + open.length)
        }
      }

      const changes: ChangeSpec[] = found
        .filter((segment) => !segment.styled)
        .map(({ from, to }) => [
          { from, insert: open },
          { from: to, insert: close }
        ])
      const set = ChangeSet.of(changes, state.doc.length)
      // The selection stays on the text, inside the new delimiters.
      return {
        changes: set,
        range: EditorSelection.range(set.mapPos(range.from, 1), set.mapPos(range.to, -1))
      }
    })
    view.dispatch(state.update(transaction, { scrollIntoView: true, userEvent: 'input' }))
    return true
  }
}

export function emphasisKeys(): Extension {
  return keymap.of([
    { key: 'Mod-b', run: toggleEmphasis('bold') },
    { key: 'Mod-i', run: toggleEmphasis('italic') },
    { key: 'Mod-u', run: toggleEmphasis('underline') }
  ])
}
