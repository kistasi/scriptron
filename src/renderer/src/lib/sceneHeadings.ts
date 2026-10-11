// Locations and times of day from scene headings, for autocompleting them in the editor.

import { byFrequency } from './byFrequency'
import { sceneNumber, type LineType } from './fountainLines'

// The prefixes offered while typing the start of a scene heading.
export const headingPrefixes = ['INT.', 'EXT.', 'INT./EXT.', 'I/E.', 'EST.']

// A complete prefix followed by a space: "INT. ", "ext ", "I/E. ".
export const typedPrefix = /^(?:int\.?\/ext|i\/e|int|ext|est)\.?\s+/i

// Times of day offered even before the script uses them.
export const commonTimes = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'CONTINUOUS', 'LATER']

export interface SceneHeading {
  location: string
  time: string | null
}

// "INT. HOUSE - KITCHEN - DAY #12#" is the location "HOUSE - KITCHEN" at the time "DAY".
// A forced heading without a prefix (".FLASHBACK") is all location.
export function parseHeading(text: string): SceneHeading {
  const body = text.trim().replace(/^\./, '').replace(sceneNumber, '').replace(typedPrefix, '')
  const dash = body.lastIndexOf(' - ')
  if (dash === -1) return { location: body.trim(), time: null }
  return { location: body.slice(0, dash).trim(), time: body.slice(dash + 3).trim() || null }
}

// The locations and times of day of all scene headings, most frequent first, skipping the line
// being typed, in capitals. Times also include the common ones.
export function headingParts(
  lines: readonly string[],
  types: readonly LineType[],
  skip?: number
): { locations: string[]; times: string[] } {
  const headings = types
    .map((type, i) =>
      type === 'scene-heading' && i !== skip ? parseHeading(lines[i].toUpperCase()) : null
    )
    .filter((heading) => heading !== null)
  const locations = byFrequency(headings.map((h) => h.location).filter((l) => l !== ''))
  const used = byFrequency(headings.map((h) => h.time).filter((t) => t !== null))
  return { locations, times: [...new Set([...used, ...commonTimes])] }
}

// A scene heading in capitals, leaving any [[notes]] in it as they are.
export function uppercaseHeading(text: string): string {
  return text
    .split(/(\[\[.*?\]\])/)
    .map((part, i) => (i % 2 === 0 ? part.toUpperCase() : part))
    .join('')
}
