import type { Text } from '@codemirror/state'
import { classifyLines, type LineType } from './lib/fountainLines'

export interface ClassifiedDoc {
  lines: readonly string[]
  types: readonly LineType[]
}

// Documents are immutable, so each is classified once however many extensions ask: formatting,
// spellchecking, the toolbar and the commands all read it on the same keystroke.
const cache = new WeakMap<Text, ClassifiedDoc>()

// The document's lines and the type of each, by 0-based line index.
export function classifiedDoc(doc: Text): ClassifiedDoc {
  let classified = cache.get(doc)
  if (!classified) {
    const lines = doc.toJSON()
    classified = { lines, types: classifyLines(lines) }
    cache.set(doc, classified)
  }
  return classified
}
