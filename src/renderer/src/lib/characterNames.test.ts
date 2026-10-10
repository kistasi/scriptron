import { describe, expect, it } from 'vitest'
import { characterCue, characterNames, cueName } from './characterNames'
import { classifyLines } from './fountainLines'

const parse = (text: string): [string[], ReturnType<typeof classifyLines>] => {
  const lines = text.split('\n')
  return [lines, classifyLines(lines)]
}

describe('cueName', () => {
  it('strips forcing, extensions and dual dialogue markers', () => {
    expect(cueName('@McCoy (V.O.) ^')).toBe('McCoy')
    expect(cueName("BOB (CONT'D)")).toBe('BOB')
    expect(cueName('  MÁRK  ')).toBe('MÁRK')
  })
})

describe('characterNames', () => {
  it('lists each speaker once, most frequent first, skipping the given line', () => {
    const [lines, types] = parse('ALICE\nHi.\n\nBOB\nHi.\n\nBOB (V.O.)\nAgain.\n\nCAROL\nYo.')
    expect(characterNames(lines, types)).toEqual(['BOB', 'ALICE', 'CAROL'])
    expect(characterNames(lines, types, 9)).toEqual(['BOB', 'ALICE'])
  })
})

describe('characterCue', () => {
  it("adds (CONT'D) when the same character spoke last in the scene", () => {
    const [lines, types] = parse('INT. ROOM - DAY\n\nBOB\nHi.\n\nHe sits.\n\n')
    expect(characterCue('BOB', lines, types, 7)).toBe("BOB (CONT'D)")
    expect(characterCue('ALICE', lines, types, 7)).toBe('ALICE')
  })

  it('does not when someone else spoke in between', () => {
    const [lines, types] = parse('BOB\nHi.\n\nALICE\nHello.\n\n')
    expect(characterCue('BOB', lines, types, 6)).toBe('BOB')
  })

  it('does not across a scene heading', () => {
    const [lines, types] = parse('BOB\nHi.\n\nEXT. ROAD - NIGHT\n\n')
    expect(characterCue('BOB', lines, types, 5)).toBe('BOB')
  })
})
