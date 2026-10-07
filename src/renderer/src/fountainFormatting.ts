import { type Extension, type Range, StateField, type Text } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { classifyLines, inlineRanges, type InlineStyle, type LineType } from './lib/fountainLines'
import { paginate, sceneNumbers } from './lib/screenplayLayout'

const pageGap = '24px'
const lineHeight = '12pt'

// Drawn between two source lines: the unused lines and bottom margin of one page, a gap,
// and the top margin of the next page with its number. The last page gets only the filler.
class PageBreakWidget extends WidgetType {
  constructor(
    readonly page: number | null,
    readonly remaining: number
  ) {
    super()
  }

  eq(other: PageBreakWidget): boolean {
    return other.page === this.page && other.remaining === this.remaining
  }

  toDOM(): HTMLElement {
    const gap = document.createElement('div')
    gap.className = this.page === null ? 'fl-page-end' : 'fl-page-gap'
    gap.style.setProperty('--remaining', String(this.remaining))
    gap.setAttribute('aria-hidden', 'true')
    // Page 1 is conventionally left unnumbered.
    if (this.page !== null && this.page > 1) {
      const number = document.createElement('span')
      number.className = 'fl-page-number'
      number.textContent = `${this.page}.`
      gap.appendChild(number)
    }
    return gap
  }

  get estimatedHeight(): number {
    return this.remaining * 16 + (this.page === null ? 0 : 2 * 96 + parseInt(pageGap))
  }
}

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
  const scenes = sceneNumbers(lines, types)
  const decorations: Range<Decoration>[] = []

  const pagination = paginate(lines, types)
  for (const { line, page, remaining } of pagination.breaks) {
    const widget = new PageBreakWidget(page, remaining)
    decorations.push(
      Decoration.widget({ widget, block: true, side: -1 }).range(doc.line(line + 1).from)
    )
  }
  const lastPage = new PageBreakWidget(null, pagination.remaining)
  decorations.push(Decoration.widget({ widget: lastPage, block: true, side: 1 }).range(doc.length))

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const type = types[n - 1]
    const scene = scenes.get(n - 1)
    decorations.push(
      (scene === undefined
        ? lineDecoration(type)
        : Decoration.line({ class: `fl-${type}`, attributes: { 'data-scene': scene } })
      ).range(line.from)
    )
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
    // 6 lines per inch, as on a printed page, so pagination matches what is shown.
    lineHeight
  },
  '.cm-content': {
    flex: '0 1 8.5in',
    boxSizing: 'border-box',
    padding: '1in 1in 1in 1.5in',
    background: '#fff',
    caretColor: '#000'
  },
  '.cm-line': { padding: '0' },

  '.fl-scene-heading': { position: 'relative', fontWeight: 'bold', textTransform: 'uppercase' },
  '.fl-scene-heading[data-scene]::before, .fl-scene-heading[data-scene]::after': {
    content: 'attr(data-scene)',
    position: 'absolute',
    top: '0'
  },
  '.fl-scene-heading[data-scene]::before': { right: 'calc(100% + 0.5in)' },
  '.fl-scene-heading[data-scene]::after': { left: 'calc(100% + 0.4in)' },

  // --remaining is set per widget: the unused lines at the bottom of the page.
  '.fl-page-gap, .fl-page-end': {
    '--page-fill': `calc(var(--remaining) * ${lineHeight})`
  },
  '.fl-page-end': { height: 'var(--page-fill)' },
  '.fl-page-gap': {
    '--page-end': 'calc(var(--page-fill) + 1in)',
    position: 'relative',
    height: `calc(var(--page-end) + ${pageGap} + 1in)`,
    margin: '0 -1in 0 -1.5in',
    background: `linear-gradient(#fff var(--page-end), #eceae6 var(--page-end), #eceae6 calc(var(--page-end) + ${pageGap}), #fff calc(var(--page-end) + ${pageGap}))`
  },
  '.fl-page-number': {
    position: 'absolute',
    top: `calc(var(--page-end) + ${pageGap} + 0.5in)`,
    right: '1in',
    fontWeight: 'normal'
  },
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
