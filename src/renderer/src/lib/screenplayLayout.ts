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
export function wrappedLineCount(text: string, width: number): number {
  let lines = 1
  let column = 0
  for (const word of text.split(' ')) {
    if (column > 0) {
      if (column + 1 + word.length > width) {
        lines++
        column = 0
      } else {
        column++
      }
    }
    let remaining = word.length
    while (column + remaining > width) {
      lines++
      remaining -= width - column
      column = 0
    }
    column += remaining
  }
  return lines
}

export interface PageBreak {
  // Index of the first source line on the new page.
  line: number
  // Page number of the new page (the page after a title page is 1).
  page: number
  // Unused lines at the bottom of the page that ends here.
  remaining: number
}

export interface Pagination {
  breaks: PageBreak[]
  // Unused lines at the bottom of the last page.
  remaining: number
}

// Groups of consecutive source lines that should not be split across pages.
function keepTogetherGroups(types: LineType[], start: number): [number, number][] {
  const groups: [number, number][] = []
  for (let i = start; i < types.length;) {
    let end = i + 1
    if (types[i] === 'character') {
      while (end < types.length && (types[end] === 'dialogue' || types[end] === 'parenthetical')) {
        end++
      }
    }
    groups.push([i, end])
    i = end
  }

  // A scene heading stays with the blank lines and the element that follow it.
  const merged: [number, number][] = []
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]
    if (types[group[0]] === 'scene-heading') {
      while (g + 1 < groups.length) {
        group[1] = groups[++g][1]
        if (types[groups[g][0]] !== 'empty') break
      }
    }
    merged.push(group)
  }
  return merged
}

export function paginate(lines: string[], types: LineType[]): Pagination {
  const breaks: PageBreak[] = []
  const height = (i: number): number =>
    wrappedLineCount(lines[i], columnWidth[types[i]] ?? defaultWidth)

  // The title page is a page of its own and isn't numbered.
  let start = 0
  while (types[start] === 'title-page') start++
  if (start > 0) {
    while (types[start] === 'empty') start++
    if (start < lines.length) {
      let titleHeight = 0
      for (let i = 0; i < start; i++) titleHeight += height(i)
      breaks.push({ line: start, page: 1, remaining: Math.max(0, LINES_PER_PAGE - titleHeight) })
    }
  }

  let page = 1
  let used = 0
  // Lines before this index were already placed by an explicit page break.
  let skipUntil = 0
  const newPage = (line: number): void => {
    breaks.push({ line, page: ++page, remaining: Math.max(0, LINES_PER_PAGE - used) })
    used = 0
  }

  for (const [from, to] of keepTogetherGroups(types, start)) {
    if (from < skipUntil) continue

    if (types[from] === 'empty') {
      // Blank lines never push content to the next page; at the bottom of a page they are absorbed.
      if (used < LINES_PER_PAGE) used++
      continue
    }

    let groupHeight = 0
    for (let i = from; i < to; i++) groupHeight += height(i)

    if (used > 0 && used + groupHeight > LINES_PER_PAGE) newPage(from)

    if (groupHeight <= LINES_PER_PAGE) {
      used += groupHeight
    } else {
      // Longer than a page: break between its lines.
      for (let i = from; i < to; i++) {
        const h = height(i)
        if (used > 0 && used + h > LINES_PER_PAGE) newPage(i)
        used += h
      }
    }

    // An explicit page break (===) ends the page; the next page starts at the next content.
    if (types[to - 1] === 'page-break') {
      skipUntil = to
      while (types[skipUntil] === 'empty') skipUntil++
      if (skipUntil < lines.length) newPage(skipUntil)
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
