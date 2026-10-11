import type { CompletionContext } from '@codemirror/autocomplete'
import type { Line } from '@codemirror/state'
import { classifiedDoc, type ClassifiedDoc } from './classifiedDoc'

export interface TypedLine extends ClassifiedDoc {
  line: Line
  // The line's index in lines and types.
  index: number
}

// The line being typed when it may start an element that follows a blank line, such as a
// character cue or a scene heading: the cursor is at its end, outside boneyard and the title page.
export function typedLineAt({ state, pos }: CompletionContext): TypedLine | null {
  const line = state.doc.lineAt(pos)
  if (pos !== line.to) return null
  if (line.number > 1 && state.doc.line(line.number - 1).text.trim() !== '') return null

  const { lines, types } = classifiedDoc(state.doc)
  const index = line.number - 1
  if (types[index] === 'boneyard' || types[index] === 'title-page') return null
  return { line, index, lines, types }
}
