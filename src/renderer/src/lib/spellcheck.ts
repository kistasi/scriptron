// Which parts of a screenplay Chromium's spellchecker looks at.

import { inlineRanges, type LineType } from './fountainLines'

// Prose; headings, cues, transitions, notes and the title page are left alone.
const checkedTypes = new Set<LineType>([
  'action',
  'dialogue',
  'parenthetical',
  'centered',
  'synopsis'
])

export const isChecked = (type: LineType): boolean => checkedTypes.has(type)

// Matches the words of characters' names as whole words, in any case and with a possessive ’s.
export function namePattern(names: readonly string[]): RegExp | null {
  const words = new Set<string>()
  for (const name of names) {
    // Only letters, apostrophes and hyphens are kept, none of which need escaping.
    for (const word of name.split(/[^\p{L}\p{M}'’-]+/u)) if (word) words.add(word)
  }
  if (words.size === 0) return null
  return new RegExp(
    `(?<![\\p{L}\\p{M}])(?:${[...words].join('|')})(?:['’]s)?(?![\\p{L}\\p{M}])`,
    'giu'
  )
}

// The ranges of a checked line to leave unchecked: Fountain markup, inline notes and characters'
// names, in order.
export function uncheckedRanges(
  text: string,
  type: LineType,
  names: RegExp | null
): { from: number; to: number }[] {
  const ranges = inlineRanges(text, type)
    .filter(({ style }) => style === 'marker' || style === 'note')
    .map(({ from, to }) => ({ from, to }))
  if (names) {
    for (const match of text.matchAll(names)) {
      ranges.push({ from: match.index, to: match.index + match[0].length })
    }
  }
  return ranges.sort((a, b) => a.from - b.from)
}
