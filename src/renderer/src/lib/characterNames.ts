// Character names for autocompleting character cues in the editor.

import type { LineType } from './fountainLines'

// The bare name of a character cue: "@McCoy (V.O.) ^" is "McCoy".
export function cueName(cue: string): string {
  return cue
    .trim()
    .replace(/^@/, '')
    .replace(/\s*\^$/, '')
    .replace(/\s*\(.*\)$/, '')
    .trim()
}

// The names of all character cues, most frequent first, skipping the line being typed.
export function characterNames(lines: string[], types: LineType[], skip?: number): string[] {
  const counts = new Map<string, number>()
  types.forEach((type, i) => {
    if (type !== 'character' || i === skip) return
    const name = cueName(lines[i])
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  })
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!)
}

// The name of the last speaker before a line in the same scene, if any.
export function previousSpeaker(lines: string[], types: LineType[], line: number): string | null {
  for (let i = line - 1; i >= 0; i--) {
    if (types[i] === 'scene-heading') return null
    if (types[i] === 'character') return cueName(lines[i])
  }
  return null
}

// The cue for a character speaking at a line: with (CONT'D) when they also had the
// previous speech in the scene, interrupted only by action.
export function characterCue(
  name: string,
  lines: string[],
  types: LineType[],
  line: number
): string {
  return previousSpeaker(lines, types, line) === name ? `${name} (CONT'D)` : name
}
