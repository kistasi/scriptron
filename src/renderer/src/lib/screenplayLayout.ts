// Pagination and scene numbering for classified Fountain lines.
// Measurements follow standard screenplay format: 12pt Courier (10 characters per inch,
// 6 lines per inch) on US Letter with 1in top/bottom margins, so 54 lines per page.

import type { LineType } from './fountainLines'

export const LINES_PER_PAGE = 54

// Text column width in characters for each element (6in text column, minus indents).
const columnWidth: Partial<Record<LineType, number>> = {
  character: 38,
  dialogue: 35,
  parenthetical: 24
}
const defaultWidth = 60

// Approximates the browser's word wrapping for a monospace line of the given width.
// Returns the offset at which each visual row starts.
export function rowStarts(text: string, width: number): number[] {
  const starts = [0]
  let column = 0
  let position = 0
  for (const word of text.split(' ')) {
    if (column > 0) {
      if (column + 1 + word.length > width) {
        // The space before the word stays at the end of the previous row.
        starts.push(position)
        column = 0
      } else {
        column++
      }
    }
    let remaining = word.length
    let wordPosition = position
    while (column + remaining > width) {
      const taken = width - column
      wordPosition += taken
      starts.push(wordPosition)
      remaining -= taken
      column = 0
    }
    column += remaining
    position += word.length + 1
  }
  return starts
}

export function wrappedLineCount(text: string, width: number): number {
  return rowStarts(text, width).length
}

export interface PageBreak {
  // Index of the source line where the new page starts.
  line: number
  // Offset within that line where the new page starts; 0 unless a speech is split mid-line.
  offset: number
  // Page number of the new page (the page after a title page is 1).
  page: number
  // Unused lines at the bottom of the page that ends here.
  remaining: number
  // Set when a speech continues on the new page: the character cue to repeat, e.g. "BOB (CONT'D)".
  // The page that ends here then finishes with (MORE).
  continued?: string
}

export interface Pagination {
  breaks: PageBreak[]
  // Unused lines at the bottom of the last page.
  remaining: number
}

// The part of a speech still to be placed: a dialogue or parenthetical line from offset on.
interface Segment {
  line: number
  offset: number
  type: LineType
  text: string
  rows: number
}

interface Split {
  // Index of the segment the new page starts in, and the offset within its text.
  segment: number
  at: number
  // Rows that stay on the current page, including the cue.
  rowsBefore: number
}

// Speech text before a sentence starts: ". ", "?! ", '." ', ...
const sentenceEnd = /[.?!…]+["'”’)]*\s+(?=\S)/g

// Finds where to split a speech so that at most `available` rows stay on this page.
// Prefers ending the page at a sentence or line boundary, then at any word, keeping at
// least `minRows` rows of the speech on each page.
function findSplit(
  segments: Segment[],
  cueRows: number,
  available: number,
  minRows: number,
  width: (type: LineType) => number
): Split | null {
  const rowsAfterSegment: number[] = []
  for (let k = segments.length - 1, sum = 0; k >= 0; k--) {
    rowsAfterSegment[k] = sum
    sum += segments[k].rows
  }

  let best: Split | null = null
  let bestPreferred = false
  let rowsBeforeSegment = cueRows

  const consider = (segment: number, at: number, preferred: boolean): void => {
    const { text, type } = segments[segment]
    const rowsBefore =
      rowsBeforeSegment + (at > 0 ? wrappedLineCount(text.slice(0, at).trimEnd(), width(type)) : 0)
    const rowsAfter = wrappedLineCount(text.slice(at), width(type)) + rowsAfterSegment[segment]
    if (rowsBefore > available || rowsBefore - cueRows < minRows || rowsAfter < minRows) return
    if (best && bestPreferred && !preferred) return
    if (best && bestPreferred === preferred && best.rowsBefore >= rowsBefore) return
    best = { segment, at, rowsBefore }
    bestPreferred = preferred
  }

  segments.forEach((segment, k) => {
    // Between lines, but never right after a parenthetical.
    if (k > 0 && segments[k - 1].type !== 'parenthetical') consider(k, 0, true)

    // Within a line: dialogue only, unless nothing else can work.
    if (segment.type === 'dialogue' || minRows === 1) {
      for (const match of segment.text.matchAll(sentenceEnd)) {
        consider(k, match.index + match[0].length, true)
      }
      for (const start of rowStarts(segment.text, width(segment.type)).slice(1)) {
        consider(k, start, false)
      }
    }

    rowsBeforeSegment += segment.rows
  })

  return best
}

// The cue repeated at the top of the next page: the name with any extension, plus (CONT'D).
function continuedCue(cue: string): string {
  const name = cue
    .trim()
    .replace(/^@/, '')
    .replace(/\s*\^$/, '')
    .replace(/\s*\(CONT'D\)$/i, '')
  return `${name} (CONT'D)`
}

export function paginate(lines: string[], types: LineType[]): Pagination {
  const breaks: PageBreak[] = []
  const width = (type: LineType): number => columnWidth[type] ?? defaultWidth
  const height = (i: number): number => wrappedLineCount(lines[i], width(types[i]))

  // The title page is a page of its own and isn't numbered.
  let start = 0
  while (types[start] === 'title-page') start++
  if (start > 0) {
    while (types[start] === 'empty') start++
    if (start < lines.length) {
      let titleHeight = 0
      for (let i = 0; i < start; i++) titleHeight += height(i)
      breaks.push({
        line: start,
        offset: 0,
        page: 1,
        remaining: Math.max(0, LINES_PER_PAGE - titleHeight)
      })
    }
  }

  let page = 1
  let used = 0
  const newPage = (line: number, offset = 0, continued?: string): void => {
    breaks.push({
      line,
      offset,
      page: ++page,
      remaining: Math.max(0, LINES_PER_PAGE - used),
      continued
    })
    used = 0
  }

  // Places the speech on lines [from, to): a character cue followed by dialogue and
  // parentheticals, splitting it across pages with (MORE) / (CONT'D) where needed.
  const placeSpeech = (from: number, to: number): void => {
    let cueRows = height(from)
    let segments: Segment[] = []
    for (let i = from + 1; i < to; i++) {
      segments.push({ line: i, offset: 0, type: types[i], text: lines[i], rows: height(i) })
    }

    for (;;) {
      const total = cueRows + segments.reduce((sum, segment) => sum + segment.rows, 0)
      if (used + total <= LINES_PER_PAGE) {
        used += total
        return
      }

      // One row is needed for (MORE). At the top of a page anything goes, so it always fits.
      const atTop = used === 0
      const split = findSplit(segments, cueRows, LINES_PER_PAGE - used - 1, atTop ? 1 : 2, width)
      if (!split) {
        if (atTop) {
          // A single line taller than a page: nothing sensible to do but let it overflow.
          used += total
          return
        }
        // Doesn't fit and can't be split well here: move the whole speech to the next page.
        // (A continued speech always starts at the top of a page, so this is the first part.)
        newPage(from)
        continue
      }

      const segment = segments[split.segment]
      used += split.rowsBefore + 1
      newPage(segment.line, segment.offset + split.at, continuedCue(lines[from]))

      const rest = segment.text.slice(split.at)
      segments = [
        {
          ...segment,
          offset: segment.offset + split.at,
          text: rest,
          rows: wrappedLineCount(rest, width(segment.type))
        },
        ...segments.slice(split.segment + 1)
      ]
      // On the next page the speech is headed by the one-line (CONT'D) cue.
      cueRows = 1
    }
  }

  for (let i = start; i < lines.length; i++) {
    const type = types[i]

    if (type === 'empty') {
      // Blank lines never push content to the next page; at the bottom of a page they are absorbed.
      if (used < LINES_PER_PAGE) used++
      continue
    }

    if (type === 'character') {
      let end = i + 1
      while (end < lines.length && (types[end] === 'dialogue' || types[end] === 'parenthetical')) {
        end++
      }
      placeSpeech(i, end)
      i = end - 1
      continue
    }

    let needed = height(i)
    if (type === 'scene-heading') {
      // Keep the heading with the blank lines and the first two lines of what follows.
      let next = i + 1
      while (types[next] === 'empty') {
        needed++
        next++
      }
      if (next < lines.length) {
        needed += types[next] === 'character' ? height(next) + 2 : Math.min(2, height(next))
      }
    }
    if (used > 0 && used + needed > LINES_PER_PAGE) newPage(i)
    used += height(i)

    // An explicit page break (===) ends the page; the next page starts at the next content.
    if (type === 'page-break') {
      let next = i + 1
      while (types[next] === 'empty') next++
      if (next < lines.length) newPage(next)
      i = next - 1
    }
  }

  return { breaks, remaining: Math.max(0, LINES_PER_PAGE - used) }
}

const explicitSceneNumber = /#([^#\s][^#]*)#\s*$/

// Scene number for each scene heading line: the explicit "#12#" number if present,
// otherwise the next number in sequence.
export function sceneNumbers(lines: string[], types: LineType[]): Map<number, string> {
  const numbers = new Map<number, string>()
  let count = 0
  types.forEach((type, i) => {
    if (type !== 'scene-heading') return
    count++
    numbers.set(i, explicitSceneNumber.exec(lines[i])?.[1].trim() ?? String(count))
  })
  return numbers
}
