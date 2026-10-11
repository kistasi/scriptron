import { type EditorState, type Extension, Facet, type Range, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { classifiedDoc } from './classifiedDoc'
import { inlineRanges, type InlineStyle, type LineType } from './lib/fountainLines'
import {
  elementIndents,
  page,
  pageNumber,
  paginate,
  sceneNumberMargins,
  sceneNumbers
} from './lib/screenplayLayout'

// CSS pixels: 96 per inch, and 12pt type at 6 lines per inch is 16px per line.
const pixelsPerInch = 96
const lineHeight = 16
const pageGap = 24

// The page is shown at actual size with 12pt type. Other text sizes scale the whole page,
// so that lines wrap and pages break exactly as when printed.
export const baseFontSize = 12

// Ends one page and starts the next: (MORE) if a speech continues, the unused lines and
// bottom margin, a gap, the top margin with the page number, and the (CONT'D) cue.
// Placed between source lines, or inside a dialogue line when a speech is split mid-line.
// The widget after the last line (page null) only fills out the last page.
class PageBreakWidget extends WidgetType {
  constructor(
    readonly page: number | null,
    readonly remaining: number,
    readonly scale: number,
    readonly continued?: string
  ) {
    super()
  }

  eq(other: PageBreakWidget): boolean {
    return (
      other.page === this.page &&
      other.remaining === this.remaining &&
      other.scale === this.scale &&
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
    return (
      (lines * lineHeight + (this.page === null ? 0 : margins)) * this.scale +
      (this.page === null ? 0 : pageGap)
    )
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
function buildDecorations(state: EditorState): DecorationSet {
  const { doc } = state
  const scale = state.facet(editorFontSize) / baseFontSize
  const { lines, types } = classifiedDoc(doc)
  const scenes = sceneNumbers(lines, types)
  const decorations: Range<Decoration>[] = []

  const pagination = paginate(lines, types)
  for (const { line, offset, page, remaining, continued } of pagination.breaks) {
    const widget = new PageBreakWidget(page, remaining, scale, continued)
    const position = doc.line(line + 1).from + offset
    decorations.push(
      (offset === 0
        ? Decoration.widget({ widget, block: true, side: -1 })
        : Decoration.widget({ widget, side: -1 })
      ).range(position)
    )
  }
  const lastPage = new PageBreakWidget(null, pagination.remaining, scale)
  decorations.push(Decoration.widget({ widget: lastPage, block: true, side: 1 }).range(doc.length))

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const type = types[n - 1]
    const scene = scenes.get(n - 1)
    const spaced = pagination.spacedHeadings.has(n - 1)
    decorations.push(
      (scene === undefined && !spaced
        ? lineDecoration(type)
        : Decoration.line({
            class: spaced ? `fl-${type} fl-spaced` : `fl-${type}`,
            attributes: scene === undefined ? {} : { 'data-scene': scene }
          })
      ).range(line.from)
    )
    for (const { from, to, style } of inlineRanges(line.text, type)) {
      decorations.push(inlineDecorations[style].range(line.from + from, line.from + to))
    }
  }

  return Decoration.set(decorations, true)
}

// The editor's text size in points.
const editorFontSize = Facet.define<number, number>({
  combine: (values) => values[0] ?? baseFontSize
})

const formatting = StateField.define<DecorationSet>({
  create: buildDecorations,
  update: (decorations, tr) =>
    tr.docChanged || tr.startState.facet(editorFontSize) !== tr.state.facet(editorFontSize)
      ? buildDecorations(tr.state)
      : decorations,
  provide: (field) => EditorView.decorations.from(field)
})

// The page and element geometry comes from screenplayLayout, so that it matches pagination.
// Colors are CSS variables from app.css, which switch with the light or dark appearance.
// Sizes are multiplied by --scale, the text size over baseFontSize, which the element holding
// the editor sets. One theme then serves every size, and pinching can change it every frame.
const inches = (value: number): string => `calc(${value}in * var(--scale))`
const row = `calc(${lineHeight}px * var(--scale))`

// Page breaks span the full page width: negative margins undo the page margins, and for
// breaks inside a dialogue or parenthetical line also that element's indents.
const breakMargin = (indent = { left: 0, right: 0 }): string =>
  `0 ${inches(-(page.right + indent.right))} 0 ${inches(-(page.left + indent.left))}`

const elementStyles = Object.fromEntries(
  Object.entries(elementIndents).flatMap(([type, indent]) => [
    [`.fl-${type}`, { paddingLeft: inches(indent.left), paddingRight: inches(indent.right) }],
    [`.fl-${type} .fl-break`, { margin: breakMargin(indent) }]
  ])
)

// Created once: swapping between EditorView.theme instances, one per size, made style-mod
// reorder its rules so that CodeMirror's base theme ended up overriding this one.
const screenplayTheme = EditorView.theme({
  '&': { height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    padding: '24px 16px',
    background: 'var(--desk)',
    color: 'var(--ink)',
    fontFamily: "'Courier Prime', Courier, monospace",
    fontSize: `calc(${baseFontSize}pt * var(--scale))`,
    // 6 lines per inch, as on a printed page, so pagination matches what is shown.
    lineHeight: row
  },
  '.cm-content': {
    // A hair wider than the page: layout rounding must never make a column narrower than its
    // width in characters, or the browser would wrap lines earlier than the pagination.
    // The page never shrinks, which would wrap lines early: a window too narrow for it scrolls
    // sideways. Auto margins center it while keeping any overflow scrollable.
    // Important, because once the page is wider than the window CodeMirror pins its width with an
    // inline flex-basis, which it doesn't clear when the text size changes.
    flex: `0 0 calc(${inches(page.width)} + 0.01in) !important`,
    margin: '0 auto',
    boxSizing: 'border-box',
    padding: [page.top, page.right, page.bottom, page.left].map(inches).join(' '),
    // Positioned without a z-index, so the paper below can sit under the selection layer.
    position: 'relative',
    caretColor: 'var(--caret)'
  },
  // The paper is painted under the selection layer (z-index -1): a background on .cm-content
  // itself would cover the selection.
  '.cm-content::before': {
    content: "''",
    position: 'absolute',
    inset: '0',
    zIndex: '-2',
    background: 'var(--paper)'
  },
  // Spaces at the end of a row hang, as in the pagination (CodeMirror's default, break-spaces,
  // would wrap a word whose following space doesn't fit).
  '.cm-content.cm-lineWrapping': { whiteSpace: 'pre-wrap' },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--caret)' },
  '.cm-selectionBackground': { background: 'var(--selection)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    background: 'var(--selection-focused)'
  },

  ...elementStyles,
  // Extends the scene heading's indents from elementStyles.
  '.fl-scene-heading': {
    ...elementStyles['.fl-scene-heading'],
    position: 'relative',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  '.fl-scene-heading[data-scene]::before, .fl-scene-heading[data-scene]::after': {
    content: 'attr(data-scene)',
    position: 'absolute',
    top: '0'
  },
  // Scene numbers are positioned from the edges of the line's padding box, which are the
  // edges of the text column (the heading's right indent is padding).
  '.fl-scene-heading[data-scene]::before': {
    left: inches(-(page.left - sceneNumberMargins.left))
  },
  '.fl-scene-heading[data-scene]::after': {
    right: inches(-(page.right - sceneNumberMargins.right))
  },
  // An extra blank row above scene headings, except at the top of a page.
  '.fl-spaced': { paddingTop: row },
  '.fl-spaced[data-scene]::before, .fl-spaced[data-scene]::after': { top: row },

  '.fl-break': {
    display: 'block',
    margin: breakMargin(),
    background: 'var(--paper)',
    color: 'var(--ink)',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    textTransform: 'none'
  },
  // --remaining is set per widget: the unused lines at the bottom of the page.
  '.fl-break-fill': { height: `calc(var(--remaining) * ${row})` },
  '.fl-break-page .fl-break-fill': {
    height: `calc(var(--remaining) * ${row} + ${inches(page.bottom)})`
  },
  '.fl-break-gap': { height: `${pageGap}px`, background: 'var(--desk)' },
  '.fl-break-top': { position: 'relative', height: inches(page.top) },
  '.fl-break-number': {
    position: 'absolute',
    top: inches(pageNumber.top),
    right: inches(pageNumber.right)
  },
  // (MORE) and (CONT'D) sit at the character cue indent.
  '.fl-break-cue': { paddingLeft: inches(page.left + (elementIndents.character?.left ?? 0)) },
  '.fl-transition': { textAlign: 'right' },
  '.fl-centered': { textAlign: 'center' },
  '.fl-title-page': { color: 'var(--title-page)' },
  '.fl-section': { color: 'var(--section)' },
  '.fl-synopsis': { color: 'var(--synopsis)', fontStyle: 'italic' },
  '.fl-note, .fl-inline-note': { color: 'var(--note)' },
  '.fl-boneyard': { color: 'var(--boneyard)' },
  '.fl-page-break': { color: 'var(--boneyard)' },

  '.fl-bold': { fontWeight: 'bold' },
  '.fl-italic': { fontStyle: 'italic' },
  '.fl-underline': { textDecoration: 'underline' },
  '.fl-marker': { color: 'var(--marker)', fontWeight: 'normal', fontStyle: 'normal' }
})

// fontSize is the text size in points; reconfigure the extension (in a Compartment) to change it.
// It must match --scale, which sizes what is shown.
export function fountainFormatting(fontSize = baseFontSize): Extension {
  return [editorFontSize.of(fontSize), formatting, screenplayTheme]
}
