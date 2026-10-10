import type { ChangeSpec } from '@codemirror/state'
import type { Command, EditorView } from '@codemirror/view'
import { classifyLines, type LineType } from './lib/fountainLines'
import { uppercaseHeading } from './lib/sceneHeadings'

// The tidied text of a line, or null if it is a blank line to remove. Spaces at the ends are
// trimmed and runs of spaces inside are collapsed. Boneyard is left alone, title page values keep
// the indentation that continues them, and a dialogue line of two spaces keeps the speech going.
function tidyLines(lines: string[], types: LineType[]): (string | null)[] {
  const tidied = lines.map((line, i): string => {
    const type = types[i]
    if (type === 'boneyard' || (type === 'dialogue' && line === '  ')) return line
    const indent = type === 'title-page' ? /^\s*/.exec(line)![0] : ''
    return indent + line.trim().replace(/[ \t]+/g, ' ')
  })

  // Blank lines are removed at the start of the document, and inside a run of them all but the
  // last, which keeps a single one (or the final newline at the end).
  const isBlank = (i: number): boolean => tidied[i] === '' && types[i] !== 'boneyard'
  let atStart = true
  return tidied.map((text, i) => {
    if (!isBlank(i)) {
      atStart = false
      return text
    }
    return atStart || (i + 1 < tidied.length && isBlank(i + 1)) ? null : text
  })
}

// The edits that turn a line into its tidied text, touching only the extra whitespace so the
// cursor keeps its place in the words around it.
function lineChanges(from: number, text: string, tidied: string): ChangeSpec[] {
  if (tidied === text) return []
  if (tidied.trim() === '') return [{ from, to: from + text.length, insert: tidied }]
  const indent = tidied.length - tidied.trimStart().length
  const changes: ChangeSpec[] = []
  for (const run of text.slice(indent).matchAll(/[ \t]+/g)) {
    const start = from + indent + run.index
    const end = start + run[0].length
    if (run.index === 0 || run.index + run[0].length === text.length - indent) {
      changes.push({ from: start, to: end })
    } else if (run[0] !== ' ') {
      changes.push(
        run[0][0] === ' ' ? { from: start + 1, to: end } : { from: start, to: end, insert: ' ' }
      )
    }
  }
  return changes
}

// The edits that put a scene heading in capitals, replacing only the letters that change. The
// heading must keep its length in capitals.
function headingChanges(from: number, text: string): ChangeSpec[] {
  const upper = uppercaseHeading(text)
  const changes: ChangeSpec[] = []
  for (let i = 0; i < text.length; i++) {
    if (upper[i] !== text[i]) changes.push({ from: from + i, to: from + i + 1, insert: upper[i] })
  }
  return changes
}

// Trims extra spaces and blank lines throughout the document, puts scene headings in capitals and
// ends the document with a newline, keeping the cursor in place.
export const autoformat: Command = (view: EditorView): boolean => {
  const { doc } = view.state
  const lines = doc.toJSON()
  const types = classifyLines(lines)
  const tidied = tidyLines(lines, types)
  const changes: ChangeSpec[] = []

  if (tidied.every((text) => text === null)) {
    if (doc.length > 0) changes.push({ from: 0, to: doc.length })
  } else {
    tidied.forEach((text, i) => {
      const line = doc.line(i + 1)
      // Only blank lines before the last kept one are removed, so each has a newline to take.
      if (text === null) changes.push({ from: line.from, to: line.to + 1 })
      // A letter like "ß" becomes two in capitals ("SS"), so then the whole heading is replaced.
      else if (types[i] === 'scene-heading' && uppercaseHeading(text).length !== text.length) {
        changes.push({ from: line.from, to: line.to, insert: uppercaseHeading(text) })
      } else {
        changes.push(...lineChanges(line.from, line.text, text))
        if (types[i] === 'scene-heading') changes.push(...headingChanges(line.from, line.text))
      }
    })
    // The file ends with a newline.
    if (tidied[tidied.length - 1] !== '') changes.push({ from: doc.length, insert: '\n' })
  }

  if (changes.length > 0) view.dispatch({ changes, userEvent: 'input' })
  return true
}
