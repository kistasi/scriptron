import { type Extension, type Range, StateField, type Text } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { classifyLines, inlineRanges, type InlineStyle, type LineType } from './lib/fountainLines'
import { elementIndents, page, paginate, sceneNumbers } from './lib/screenplayLayout'

// CSS pixels: 96 per inch, and 12pt type at 6 lines per inch is 16px per line.
const pixelsPerInch = 96
const lineHeight = 16
const pageGap = 24
const inches = (value: number): string => `${value}in`

// Ends one page and starts the next: (MORE) if a speech continues, the unused lines and
// bottom margin, a gap, the top margin with the page number, and the (CONT'D) cue.
// Placed between source lines, or inside a dialogue line when a speech is split mid-line.
// The widget after the last line (page null) only fills out the last page.
class PageBreakWidget extends WidgetType {
  constructor(
    readonly page: number | null,
    readonly remaining: number,
    readonly continued?: string
  ) {
    super()
  }

  eq(other: PageBreakWidget): boolean {
    return (
      other.page === this.page &&
      other.remaining === this.remaining &&
      other.continued === this.continued
    )
  }

  toDOM(): HTMLElement {
    const element = (className: string, text?: string): HTMLElement => {
      const div = document.createElement('div')
      div.className = className
      if (text) div.textContent = text
      return div
    }

    const root = element('fl-break')
    root.setAttribute('aria-hidden', 'true')
    if (this.continued) root.append(element('fl-break-cue', '(MORE)'))

    const fill = element('fl-break-fill')
    fill.style.setProperty('--remaining', String(this.remaining))
    root.append(fill)

    if (this.page !== null) {
      root.classList.add('fl-break-page')
      root.append(element('fl-break-gap'))
      // Page 1 is conventionally left unnumbered.
      const top = element('fl-break-top')
      if (this.page > 1) top.append(element('fl-break-number', `${this.page}.`))
      root.append(top)
      if (this.continued) root.append(element('fl-break-cue', this.continued))
    }
    return root
  }

  get estimatedHeight(): number {
    const lines = this.remaining + (this.continued ? 2 : 0)
    const margins = (page.top + page.bottom) * pixelsPerInch
    return lines * lineHeight + (this.page === null ? 0 : margins + pageGap)
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
  for (const { line, offset, page, remaining, continued } of pagination.breaks) {
    const widget = new PageBreakWidget(page, remaining, continued)
    const position = doc.line(line + 1).from + offset
    decorations.push(
      (offset === 0
        ? Decoration.widget({ widget, block: true, side: -1 })
        : Decoration.widget({ widget, side: -1 })
      ).range(position)
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

// Page breaks span the full page width: negative margins undo the page margins, and for
// breaks inside a dialogue or parenthetical line also that element's indents.
function breakMargin(indent = { left: 0, right: 0 }): string {
  return `0 ${inches(-(page.right + indent.right))} 0 ${inches(-(page.left + indent.left))}`
}

const elementStyles = Object.fromEntries(
  Object.entries(elementIndents).flatMap(([type, indent]) => [
    [`.fl-${type}`, { paddingLeft: inches(indent.left), paddingRight: inches(indent.right) }],
    [`.fl-${type} .fl-break`, { margin: breakMargin(indent) }]
  ])
)

// The page and element geometry comes from screenplayLayout, so that it matches pagination.
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
    lineHeight: `${lineHeight}px`
  },
  '.cm-content': {
    flex: `0 1 ${inches(page.width)}`,
    boxSizing: 'border-box',
    padding: [page.top, page.right, page.bottom, page.left].map(inches).join(' '),
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

  '.fl-break': {
    display: 'block',
    margin: breakMargin(),
    background: '#fff',
    color: '#000',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    textTransform: 'none'
  },
  // --remaining is set per widget: the unused lines at the bottom of the page.
  '.fl-break-fill': { height: `calc(var(--remaining) * ${lineHeight}px)` },
  '.fl-break-page .fl-break-fill': {
    height: `calc(var(--remaining) * ${lineHeight}px + ${inches(page.bottom)})`
  },
  '.fl-break-gap': { height: `${pageGap}px`, background: '#eceae6' },
  '.fl-break-top': { position: 'relative', height: inches(page.top) },
  '.fl-break-number': {
    position: 'absolute',
    top: inches(page.top / 2),
    right: inches(page.right)
  },
  // (MORE) and (CONT'D) sit at the character cue indent.
  '.fl-break-cue': { paddingLeft: inches(page.left + (elementIndents.character?.left ?? 0)) },
  ...elementStyles,
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
