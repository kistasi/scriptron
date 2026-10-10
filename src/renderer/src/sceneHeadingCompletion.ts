import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  pickedCompletion,
  startCompletion
} from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { classifyLines } from './lib/fountainLines'
import { headingParts, headingPrefixes, typedPrefix } from './lib/sceneHeadings'

// A line that may be a scene heading being typed, optionally forced with ".".
const typedHeading = /^(\s*\.?)(.*)$/

interface TypedHeading {
  // Where the heading text starts, after any leading space and ".".
  from: number
  text: string
  forced: boolean
  parts: () => ReturnType<typeof headingParts>
}

// The heading being typed at the cursor: at the end of a line after a blank line.
function typedHeadingAt(context: CompletionContext): TypedHeading | null {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  if (pos !== line.to) return null
  if (line.number > 1 && state.doc.line(line.number - 1).text.trim() !== '') return null

  const [, lead, text] = typedHeading.exec(line.text)!
  if (text.trim() === '') return null

  const lines = state.doc.toJSON()
  const types = classifyLines(lines)
  const index = line.number - 1
  if (types[index] === 'boneyard' || types[index] === 'title-page') return null

  return {
    from: line.from + lead.length,
    text,
    forced: lead.includes('.'),
    parts: () => headingParts(lines, types, index)
  }
}

// Inserts the completion, putting the whole heading in capitals as written in the script (the
// editor only shows it that way), and opens the completions for the next part of the heading.
function completeHeading(headingFrom: number, text: string, next = false) {
  return (view: EditorView, completion: Completion, from: number, to: number): void => {
    const insert = view.state.sliceDoc(headingFrom, from).toUpperCase() + text
    view.dispatch({
      changes: { from: headingFrom, to, insert },
      selection: { anchor: headingFrom + insert.length },
      scrollIntoView: true,
      userEvent: 'input.complete',
      annotations: pickedCompletion.of(completion)
    })
    if (next) startCompletion(view)
  }
}

// CodeMirror sorts equally good matches alphabetically; this keeps them in the order given.
const inOrder = (option: Completion, i: number): Completion => ({
  ...option,
  boost: Math.max(-99, -i)
})

// Completing what is already typed would only swallow the Enter that ends the line.
const notTyped = (typed: string) => (label: string) => label !== typed.trimEnd()

// Completes "INT." and the other prefixes, then the locations already in the script.
export function sceneHeadingCompletions(context: CompletionContext): CompletionResult | null {
  const heading = typedHeadingAt(context)
  if (!heading) return null
  const { from, text, forced } = heading

  const prefix = typedPrefix.exec(text)
  if (prefix) {
    const typed = text.slice(prefix[0].length)
    const options = heading
      .parts()
      .locations.filter(notTyped(typed))
      .map((location) => ({
        label: location,
        type: 'location',
        apply: completeHeading(from, `${location} - `, true)
      }))
      .map(inOrder)
    return options.length > 0 ? { from: from + prefix[0].length, options } : null
  }

  // Like character cues, a heading without "." is typed in capitals before it is recognized.
  if (!forced && text !== text.toUpperCase()) return null
  const options = headingPrefixes
    .filter((option) => option.startsWith(text.toUpperCase()))
    .filter(notTyped(text.toUpperCase()))
    .map((option) => ({
      label: option,
      type: 'keyword',
      apply: completeHeading(from, `${option} `, true)
    }))
    .map(inOrder)
  return options.length > 0 ? { from, options } : null
}

// Completes the time of day after the " - " that follows the location.
export function sceneTimeCompletions(context: CompletionContext): CompletionResult | null {
  const heading = typedHeadingAt(context)
  if (!heading) return null
  const { from, text, forced } = heading
  if (!forced && !typedPrefix.test(text)) return null

  const dash = text.lastIndexOf(' - ')
  if (dash === -1) return null
  const typed = text.slice(dash + 3)
  const options = heading
    .parts()
    .times.filter(notTyped(typed))
    .map((time) => ({ label: time, type: 'time', apply: completeHeading(from, time) }))
    .map(inOrder)
  return options.length > 0 ? { from: from + dash + 3, options } : null
}
