import {
  type Completion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { characterCue, characterNames } from './lib/characterNames'
import { isUppercase } from './lib/fountainLines'
import { typedLineAt } from './typedLine'

// A line that may be a character cue being typed: all caps, or forced with "@".
const typedCue = /^(\s*@?)(.+)$/

// Cues come after a blank line, and are completed only while typing at the end of the line.
export function characterCompletions(context: CompletionContext): CompletionResult | null {
  const typedLine = typedLineAt(context)
  if (!typedLine) return null
  const { line, index, lines, types } = typedLine

  const match = typedCue.exec(line.text)
  if (!match) return null
  const [, lead, typed] = match
  if (!lead.includes('@') && !isUppercase(typed)) return null

  const options: Completion[] = characterNames(lines, types, index)
    .map((name) => characterCue(name, lines, types, index))
    // Completing what is already typed would only swallow the Enter that ends the line.
    .filter((cue) => cue !== typed.trimEnd())
    .map((cue) => ({ label: cue, type: 'character' }))
  if (options.length === 0) return null

  return { from: line.from + lead.length, options }
}
