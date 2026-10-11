import { type EditorState, type Extension, type Range, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { characterNames } from './lib/characterNames'
import { classifiedDoc } from './classifiedDoc'
import { isChecked, namePattern, uncheckedRanges } from './lib/spellcheck'

// Chromium skips any text inside an element with spellcheck="false".
const unchecked = { spellcheck: 'false' }
const uncheckedLine = Decoration.line({ attributes: unchecked })
const uncheckedText = Decoration.mark({ attributes: unchecked })

function buildDecorations(state: EditorState): DecorationSet {
  const { doc } = state
  const { lines, types } = classifiedDoc(doc)
  const names = namePattern(characterNames(lines, types))
  const decorations: Range<Decoration>[] = []
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    if (!isChecked(types[n - 1])) {
      decorations.push(uncheckedLine.range(line.from))
      continue
    }
    for (const { from, to } of uncheckedRanges(line.text, types[n - 1], names)) {
      decorations.push(uncheckedText.range(line.from + from, line.from + to))
    }
  }
  return Decoration.set(decorations, true)
}

const uncheckedParts = StateField.define<DecorationSet>({
  create: buildDecorations,
  update: (decorations, tr) => (tr.docChanged ? buildDecorations(tr.state) : decorations),
  provide: (field) => EditorView.decorations.from(field)
})

// Underlines misspellings in the screenplay's prose with Chromium's spellchecker; the main
// process offers suggestions in the context menu. Reconfigure (in a Compartment) to turn it off.
export function spellcheck(enabled: boolean): Extension {
  return enabled ? [EditorView.contentAttributes.of({ spellcheck: 'true' }), uncheckedParts] : []
}
