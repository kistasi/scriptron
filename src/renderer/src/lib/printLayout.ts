// Lays out a Fountain screenplay as printed pages, for PDF export. Rows are wrapped here
// rather than by the browser, so that the printed pages follow the pagination exactly.

import { classifyLines, inlineRanges, type LineType } from './fountainLines'
import { columnWidth, paginate, rowStarts, sceneNumbers } from './screenplayLayout'

export interface Span {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

// One printed row. Type 'more' is the (MORE) at the bottom of a page where a speech continues.
export interface Row {
  type: LineType | 'more'
  spans: Span[]
  // Scene number, on the first row of a scene heading.
  scene?: string
}

export interface PrintedPage {
  // null for the first page, which is conventionally left unnumbered.
  number: number | null
  // null for a blank row.
  rows: (Row | null)[]
}

export interface TitlePage {
  // Centered in the upper part of the page: title, credit, authors and source, with blank rows.
  center: Span[][]
  // At the bottom left (contact, copyright, notes) and bottom right (dates).
  bottomLeft: Span[][]
  bottomRight: Span[][]
}

export interface PrintedScreenplay {
  title: string
  titlePage: TitlePage | null
  pages: PrintedPage[]
}

// Lines that are part of the source but not of the printed screenplay.
const unprinted = new Set<LineType>([
  'title-page',
  'section',
  'synopsis',
  'note',
  'boneyard',
  'page-break'
])

interface StyledText {
  text: string
  styles: Omit<Span, 'text'>[]
}

// The printed text of [from, to) in a line, without Fountain syntax and inline notes,
// with the emphasis of each character.
function styledText(line: string, type: LineType, from = 0, to = line.length): StyledText {
  const hidden = new Array<boolean>(line.length).fill(false)
  const styles = Array.from({ length: line.length }, () => ({}) as Omit<Span, 'text'>)
  for (const range of inlineRanges(line, type)) {
    for (let k = range.from; k < range.to; k++) {
      if (range.style === 'marker' || range.style === 'note') hidden[k] = true
      else styles[k][range.style] = true
    }
  }
  // Escaped emphasis characters print without the backslash.
  for (let k = 0; k < line.length - 1; k++) {
    if (line[k] === '\\' && '*_'.includes(line[k + 1])) hidden[k] = true
  }

  const result: StyledText = { text: '', styles: [] }
  for (let k = from; k < to; k++) {
    if (hidden[k]) continue
    result.text += line[k]
    result.styles.push(styles[k])
  }
  return result
}

function spans({ text, styles }: StyledText, from = 0, to = text.length): Span[] {
  const result: Span[] = []
  const same = (a: Omit<Span, 'text'>, b: Omit<Span, 'text'>): boolean =>
    !a.bold === !b.bold && !a.italic === !b.italic && !a.underline === !b.underline
  for (let k = from; k < to; k++) {
    const last = result[result.length - 1]
    if (last && same(last, styles[k])) last.text += text[k]
    else result.push({ text: text[k], ...styles[k] })
  }
  return result
}

// Wraps text into rows of the element's column width, like the pagination does.
function wrap(styled: StyledText, type: LineType): Span[][] {
  const starts = rowStarts(styled.text, columnWidth(type))
  return starts.map((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : styled.text.length
    return spans(styled, start, end)
  })
}

const plainSpan = (text: string): Span[] => [{ text }]

// Title page values by lowercase key. A value may continue on indented lines below its key.
export function titlePageValues(lines: string[], types: LineType[]): Map<string, string[]> {
  const values = new Map<string, string[]>()
  let current: string[] | null = null
  for (let i = 0; i < lines.length && types[i] === 'title-page'; i++) {
    const match = /^([^:]+):(.*)$/.exec(lines[i])
    if (match && !/^\s/.test(lines[i])) {
      current = []
      values.set(match[1].trim().toLowerCase(), current)
      if (match[2].trim()) current.push(match[2].trim())
    } else if (current) {
      current.push(lines[i].trim())
    }
  }
  return values
}

// Expands Beat's {{date FORMAT}} template, e.g. "{{date YYYY-MM-dd}}".
export function expandTemplates(value: string, now: Date): string {
  return value.replace(/\{\{\s*date\s*([^}]*)\}\}/g, (_, format: string) => {
    const pad = (n: number): string => String(n).padStart(2, '0')
    const parts: Record<string, string> = {
      yyyy: String(now.getFullYear()),
      YYYY: String(now.getFullYear()),
      MM: pad(now.getMonth() + 1),
      M: String(now.getMonth() + 1),
      dd: pad(now.getDate()),
      d: String(now.getDate())
    }
    return (format.trim() || 'yyyy-MM-dd').replace(/yyyy|YYYY|MM|M|dd|d/g, (token) => parts[token])
  })
}

function layoutTitlePage(values: Map<string, string[]>, now: Date): TitlePage {
  const rows = (...keys: string[]): Span[][] =>
    keys.flatMap((key) =>
      (values.get(key) ?? []).map((value) =>
        spans(styledText(expandTemplates(value, now), 'action'))
      )
    )

  const center: Span[][] = []
  const block = (blankRows: number, block: Span[][]): void => {
    if (block.length === 0) return
    if (center.length > 0) for (let k = 0; k < blankRows; k++) center.push([])
    center.push(...block)
  }
  // The title prints in capitals.
  block(
    0,
    rows('title').map((row) => row.map((span) => ({ ...span, text: span.text.toUpperCase() })))
  )
  block(3, rows('credit'))
  block(1, rows('author', 'authors'))
  block(1, rows('source'))

  return {
    center,
    bottomLeft: rows('contact', 'copyright', 'notes'),
    bottomRight: rows('draft date', 'date')
  }
}

export function layoutScreenplay(text: string, now = new Date()): PrintedScreenplay {
  const lines = text.split('\n')
  const types = classifyLines(lines)
  const pagination = paginate(lines, types)
  const scenes = sceneNumbers(lines, types)

  const values = titlePageValues(lines, types)
  const titlePage = values.size > 0 ? layoutTitlePage(values, now) : null
  const title = (values.get('title') ?? []).map((line) => styledText(line, 'action').text).join(' ')

  const pages: PrintedPage[] = [{ number: null, rows: [] }]
  let current = pages[0]
  // Set when a line that isn't printed was skipped, to collapse the blank lines around it.
  let skipped = false

  const blank = (): void => {
    const last = current.rows[current.rows.length - 1]
    // No blank rows at the top of a page, or doubled where a line was left out.
    if (current.rows.length === 0 || (skipped && last === null)) return
    current.rows.push(null)
  }
  const newPage = (number: number): void => {
    current = { number: number > 1 ? number : null, rows: [] }
    pages.push(current)
  }
  const cue = (text: string): void => {
    current.rows.push({ type: 'character', spans: plainSpan(text) })
  }

  // Breaks by line; within a line, in order of offset.
  const breaksAt = new Map<number, typeof pagination.breaks>()
  for (const pageBreak of pagination.breaks) {
    breaksAt.set(pageBreak.line, [...(breaksAt.get(pageBreak.line) ?? []), pageBreak])
  }

  lines.forEach((line, i) => {
    const type = types[i]
    let from = 0
    const place = (to: number): void => {
      if (unprinted.has(type)) {
        skipped = true
        return
      }
      if (type === 'empty') return blank()
      const rows = wrap(styledText(line, type, from, to), type)
      rows.forEach((row, k) => {
        current.rows.push({
          type,
          spans: row,
          ...(k === 0 && scenes.has(i) ? { scene: scenes.get(i) } : {})
        })
      })
      skipped = false
    }

    for (const pageBreak of breaksAt.get(i) ?? []) {
      // The part of a dialogue line before a mid-line page break, without its trailing space.
      if (pageBreak.offset > from) {
        place(from + line.slice(from, pageBreak.offset).trimEnd().length)
        from = pageBreak.offset
      }
      if (pageBreak.continued) current.rows.push({ type: 'more', spans: plainSpan('(MORE)') })
      newPage(pageBreak.page)
      if (pageBreak.continued) cue(pageBreak.continued)
    }

    if (pagination.spacedHeadings.has(i)) current.rows.push(null)
    place(line.length)
  })

  // The title page's own page holds nothing else.
  if (titlePage && pages[0].rows.length === 0) pages.shift()

  return { title, titlePage, pages }
}
