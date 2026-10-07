import { type Extension, type Range, StateField, type Text } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { classifyLines, inlineRanges, type InlineStyle, type LineType } from './lib/fountainLines'

const lineDecorations = new Map<LineType, Decoration>()
function lineDecoration(type: LineType): Decoration {
  let decoration = lineDecorations.get(type)
  if (!decoration) {
    decoration = Decoration.line({ class: `fl-${type}` })
    lineDecorations.set(type, decoration)
  }
  return decoration
}

const inlineDecorations: Record<InlineStyle, Decoration> = {
  bold: Decoration.mark({ class: 'fl-bold' }),
  italic: Decoration.mark({ class: 'fl-italic' }),
  underline: Decoration.mark({ class: 'fl-underline' }),
  note: Decoration.mark({ class: 'fl-inline-note' }),
  marker: Decoration.mark({ class: 'fl-marker' })
}

// Classification depends on neighbouring lines (blank lines, dialogue blocks, boneyard),
// so the whole document is reclassified on every change. That is fast for screenplay-sized text.
function buildDecorations(doc: Text): DecorationSet {
  const lines = doc.toJSON()
  const types = classifyLines(lines)
  const decorations: Range<Decoration>[] = []

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const type = types[n - 1]
    decorations.push(lineDecoration(type).range(line.from))
    for (const { from, to, style } of inlineRanges(line.text, type)) {
      decorations.push(inlineDecorations[style].range(line.from + from, line.from + to))
    }
  }

  return Decoration.set(decorations, true)
}

const formatting = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state.doc),
  update: (decorations, tr) => (tr.docChanged ? buildDecorations(tr.state.doc) : decorations),
  provide: (field) => EditorView.decorations.from(field)
})

// US Letter screenplay layout: 1.5in left / 1in right page margins, 6in text column.
// Element indents are measured from the left edge of the text column.
const screenplayTheme = EditorView.theme({
  '&': { height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    justifyContent: 'center',
    padding: '24px 16px',
    background: '#eceae6',
    fontFamily: "'Courier Prime', Courier, monospace",
    fontSize: '12pt',
    lineHeight: '1.2'
  },
  '.cm-content': {
    flex: '0 1 8.5in',
    boxSizing: 'border-box',
    minHeight: '11in',
    padding: '1in 1in 1in 1.5in',
    background: '#fff',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.15)',
    caretColor: '#000'
  },
  '.cm-line': { padding: '0' },

  '.fl-scene-heading': { fontWeight: 'bold', textTransform: 'uppercase' },
  '.fl-character': { paddingLeft: '2.2in' },
  '.fl-parenthetical': { paddingLeft: '1.6in', paddingRight: '2in' },
  '.fl-dialogue': { paddingLeft: '1in', paddingRight: '1.5in' },
  '.fl-transition': { textAlign: 'right' },
  '.fl-centered': { textAlign: 'center' },
  '.fl-title-page': { color: '#555' },
  '.fl-section': { color: '#8a6d3b' },
  '.fl-synopsis': { color: '#777', fontStyle: 'italic' },
  '.fl-note, .fl-inline-note': { color: '#3a7a3a' },
  '.fl-boneyard': { color: '#aaa' },
  '.fl-page-break': { color: '#aaa' },

  '.fl-bold': { fontWeight: 'bold' },
  '.fl-italic': { fontStyle: 'italic' },
  '.fl-underline': { textDecoration: 'underline' },
  '.fl-marker': { color: '#bbb', fontWeight: 'normal', fontStyle: 'normal' }
})

export function fountainFormatting(): Extension {
  return [formatting, screenplayTheme]
}
