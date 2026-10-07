// Line-by-line Fountain classification for live formatting in the editor.
// Unlike fountain.ts this keeps a 1:1 mapping to source lines, so the result
// can be used to style the text being edited. Follows https://fountain.io/syntax.

export type LineType =
  | 'empty'
  | 'title-page'
  | 'scene-heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'centered'
  | 'section'
  | 'synopsis'
  | 'note'
  | 'boneyard'
  | 'page-break'

const sceneHeading = /^(?:int|ext|est|int\.?\/ext|i\/e)[. ]/i
const titlePageKey = /^(?:title|credit|authors?|source|notes|draft date|date|contact|copyright):/i

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === ''
}

function isUppercase(text: string): boolean {
  return /\p{L}/u.test(text) && text === text.toUpperCase()
}

// "MÁRK", "MÁRK (CONT'D)", "BOB ^" — the extension in parentheses may be mixed case.
function isCharacterName(text: string): boolean {
  const name = text.replace(/\s*\^$/, '').replace(/\s*\(.*\)$/, '')
  return isUppercase(name)
}

export function classifyLines(lines: string[]): LineType[] {
  const types: LineType[] = []
  let i = 0

  // Title page: "Key: value" lines (and indented continuations) up to the first blank line.
  if (titlePageKey.test(lines[0] ?? '')) {
    for (; i < lines.length && !isBlank(lines[i]); i++) types.push('title-page')
  }

  let inBoneyard = false

  for (; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const previous = types[i - 1]
    const blankBefore = i === 0 || isBlank(lines[i - 1])
    const blankAfter = isBlank(lines[i + 1])

    let type: LineType

    if (inBoneyard || trimmed.startsWith('/*')) {
      type = 'boneyard'
      const close = trimmed.indexOf('*/', inBoneyard ? 0 : 2)
      inBoneyard = close === -1
    } else if (
      (previous === 'character' || previous === 'dialogue' || previous === 'parenthetical') &&
      (trimmed !== '' || line === '  ')
    ) {
      // Dialogue continues until a blank line; "  " (two spaces) keeps it going.
      type = /^\(.*\)$/.test(trimmed) ? 'parenthetical' : 'dialogue'
    } else if (trimmed === '') {
      type = 'empty'
    } else if (/^={3,}$/.test(trimmed)) {
      type = 'page-break'
    } else if (trimmed.startsWith('#')) {
      type = 'section'
    } else if (trimmed.startsWith('=')) {
      type = 'synopsis'
    } else if (/^\[\[.*\]\]$/.test(trimmed)) {
      type = 'note'
    } else if (trimmed.startsWith('>') && trimmed.endsWith('<')) {
      type = 'centered'
    } else if (trimmed.startsWith('>')) {
      type = 'transition'
    } else if (trimmed.startsWith('!')) {
      type = 'action'
    } else if (/^\.[^.]/.test(trimmed) && blankBefore) {
      type = 'scene-heading'
    } else if (trimmed.startsWith('@') && !blankAfter) {
      type = 'character'
    } else if (blankBefore && blankAfter && sceneHeading.test(trimmed)) {
      type = 'scene-heading'
    } else if (blankBefore && blankAfter && trimmed.endsWith('TO:') && isUppercase(trimmed)) {
      type = 'transition'
    } else if (blankBefore && !blankAfter && isCharacterName(trimmed)) {
      type = 'character'
    } else {
      type = 'action'
    }

    types.push(type)
  }

  return types
}

export type InlineStyle = 'bold' | 'italic' | 'underline' | 'note' | 'marker'

export interface InlineRange {
  from: number
  to: number
  style: InlineStyle
}

const emphasis: [RegExp, InlineStyle[]][] = [
  [/(?<!\\)\*\*\*(?=\S)(.+?)(?<=\S)(?<!\\)\*\*\*/g, ['bold', 'italic']],
  [/(?<![\\*])\*\*(?=[^\s*])(.+?)(?<=[^\s*])(?<!\\)\*\*(?!\*)/g, ['bold']],
  [/(?<![\\*])\*(?=[^\s*])(.+?)(?<=[^\s*\\])\*(?!\*)/g, ['italic']],
  [/(?<!\\)_(?=\S)(.+?)(?<=\S)(?<!\\)_/g, ['underline']]
]

// An explicit scene number at the end of a scene heading: "INT. HOUSE - DAY #12A#".
export const sceneNumber = /\s*#([^#\s][^#]*)#\s*$/

// Fountain syntax characters at the start and end of a line, which are shown dimmed.
const leadingMarker: Partial<Record<LineType, RegExp>> = {
  'scene-heading': /^\./,
  character: /^@/,
  transition: /^>\s*/,
  centered: /^>\s*/,
  action: /^!/,
  section: /^#+\s*/,
  synopsis: /^=\s*/
}

const trailingMarker: Partial<Record<LineType, RegExp>> = {
  centered: /\s*<\s*$/,
  character: /\s*\^\s*$/,
  'scene-heading': sceneNumber
}

function markerRanges(text: string, type: LineType): InlineRange[] {
  const ranges: InlineRange[] = []
  const lead = text.length - text.trimStart().length
  const match = leadingMarker[type]?.exec(text.slice(lead))
  if (match) ranges.push({ from: lead, to: lead + match[0].length, style: 'marker' })

  const end = trailingMarker[type]?.exec(text)
  if (end) ranges.push({ from: end.index, to: text.length, style: 'marker' })

  return ranges
}

// Inline ranges (offsets within the line) for emphasis, notes and syntax markers.
export function inlineRanges(text: string, type: LineType): InlineRange[] {
  if (type === 'boneyard' || type === 'empty') return []

  const ranges = markerRanges(text, type)

  for (const [pattern, styles] of emphasis) {
    for (const match of text.matchAll(pattern)) {
      const from = match.index
      const to = from + match[0].length
      const delimiter = (match[0].length - match[1].length) / 2
      for (const style of styles) ranges.push({ from, to, style })
      ranges.push({ from, to: from + delimiter, style: 'marker' })
      ranges.push({ from: to - delimiter, to, style: 'marker' })
    }
  }

  for (const match of text.matchAll(/\[\[.*?\]\]/g)) {
    ranges.push({ from: match.index, to: match.index + match[0].length, style: 'note' })
  }

  return ranges
}
