import {
  type Completion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { characterCue, characterNames } from './lib/characterNames'
import { classifyLines } from './lib/fountainLines'

// A line that may be a character cue being typed: all caps, or forced with "@".
const typedCue = /^(\s*@?)(.+)$/

export function characterCompletions(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  // Cues come after a blank line, and are completed only while typing at the end of the line.
  if (pos !== line.to) return null
  if (line.number > 1 && state.doc.line(line.number - 1).text.trim() !== '') return null

  const match = typedCue.exec(line.text)
  if (!match) return null
  const [, lead, typed] = match
  const forced = lead.includes('@')
  if (!forced && !(/\p{L}/u.test(typed) && typed === typed.toUpperCase())) return null

  const lines = state.doc.toJSON()
  const types = classifyLines(lines)
  const index = line.number - 1
  if (types[index] === 'boneyard' || types[index] === 'title-page') return null

  const options: Completion[] = characterNames(lines, types, index)
    .map((name) => characterCue(name, lines, types, index))
    // Completing what is already typed would only swallow the Enter that ends the line.
    .filter((cue) => cue !== typed.trimEnd())
    .map((cue) => ({ label: cue, type: 'character' }))
  if (options.length === 0) return null

  return { from: line.from + lead.length, options }
}
