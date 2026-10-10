// Which parts of a screenplay are spell and grammar checked, and which issues are shown.

import type { TextIssue } from '../../../shared/ipc'
import { inlineRanges, type LineType } from './fountainLines'

// Prose; headings, cues, transitions, notes and the title page are left alone.
const checkedTypes = new Set<LineType>([
  'action',
  'dialogue',
  'parenthetical',
  'centered',
  'synopsis'
])

// The text of a line as the checker should see it: Fountain markup and inline notes are blanked
// out, keeping the offsets of everything else. null when the line isn't checked.
export function checkableText(text: string, type: LineType): string | null {
  if (!checkedTypes.has(type)) return null
  // Split by UTF-16 code unit, so that offsets stay the same as the checker's.
  const units = text.split('')
  for (const { from, to, style } of inlineRanges(text, type)) {
    if (style === 'marker' || style === 'note') units.fill(' ', from, to)
  }
  // Lyrics: "~Happy birthday to you"
  const lyric = /^\s*~/.exec(text)
  if (lyric) units[lyric[0].length - 1] = ' '
  const masked = units.join('')
  return masked.trim() === '' ? null : masked
}

// How a word is looked up in the dictionary: ignoring case and a possessive ’s.
export const dictionaryKey = (word: string): string =>
  word.toLocaleLowerCase().replace(/['’]s$/, '')

// The words that are never misspelled: the user's dictionary and the characters' names.
export function acceptedWords(
  dictionary: readonly string[],
  names: readonly string[]
): Set<string> {
  const words = new Set(dictionary.map(dictionaryKey))
  for (const name of names) {
    for (const word of name.split(/[^\p{L}\p{M}'’-]+/u)) if (word) words.add(dictionaryKey(word))
  }
  return words
}

// Identifies an issue the user chose to ignore: a misspelled word everywhere, a grammar issue
// only where it is.
export const ignoreKey = (issue: TextIssue, text: string): string =>
  issue.kind === 'spelling'
    ? `spelling:${text.slice(issue.from, issue.to)}`
    : `grammar:${issue.from}:${issue.to}:${text}`

// The issues to underline in a checked text.
export function shownIssues(
  issues: readonly TextIssue[],
  text: string,
  accepted: ReadonlySet<string>,
  ignored: ReadonlySet<string>
): TextIssue[] {
  return issues.filter(
    (issue) =>
      issue.to > issue.from &&
      issue.to <= text.length &&
      !accepted.has(dictionaryKey(text.slice(issue.from, issue.to))) &&
      !ignored.has(ignoreKey(issue, text))
  )
}
