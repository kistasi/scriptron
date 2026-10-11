import { describe, expect, it } from 'vitest'
import { filterScenes, moveScene, outlineScenes, sceneAt } from './outline'

const script = [
  'Title: Big Fish',
  '',
  'INT. WILL’S BEDROOM - NIGHT (1973)',
  '',
  'A boy sleeps.',
  '',
  '.flashback in the river [[check]]',
  '',
  'Water.',
  '',
  'ext. campfire - night #12A#',
  '',
  'Fire.'
]

describe('outlineScenes', () => {
  it('lists scene headings with their numbers, as printed', () => {
    expect(outlineScenes(script)).toEqual([
      { line: 2, number: '1', heading: 'INT. WILL’S BEDROOM - NIGHT (1973)' },
      { line: 6, number: '2', heading: 'FLASHBACK IN THE RIVER' },
      { line: 10, number: '12A', heading: 'EXT. CAMPFIRE - NIGHT' }
    ])
  })

  it('is empty without scene headings', () => {
    expect(outlineScenes(['Just action.'])).toEqual([])
  })
})

describe('filterScenes', () => {
  const scenes = outlineScenes(script)

  it('matches headings ignoring case', () => {
    expect(filterScenes(scenes, ' night ').map((s) => s.number)).toEqual(['1', '12A'])
  })

  it('matches scene numbers exactly', () => {
    expect(filterScenes(scenes, '12a').map((s) => s.number)).toEqual(['12A'])
    expect(filterScenes(scenes, '1').map((s) => s.number)).toEqual(['1'])
  })

  it('keeps every scene for an empty query', () => {
    expect(filterScenes(scenes, '  ')).toBe(scenes)
  })
})

describe('sceneAt', () => {
  const scenes = outlineScenes(script)

  it('finds the scene a line belongs to', () => {
    expect(sceneAt(scenes, 0)).toBeUndefined()
    expect(sceneAt(scenes, 2)?.number).toBe('1')
    expect(sceneAt(scenes, 8)?.number).toBe('2')
    expect(sceneAt(scenes, 12)?.number).toBe('12A')
  })
})

describe('moveScene', () => {
  const lines = [
    'Title: Test',
    '',
    'INT. A - DAY',
    '',
    'One.',
    '',
    'INT. B - DAY',
    '',
    'Two.',
    '',
    'INT. C - DAY',
    '',
    'Three.'
  ]
  const scenes = outlineScenes(lines)
  const headings = (lines: string[]): string[] => outlineScenes(lines).map((s) => s.heading)

  it('moves a scene up, keeping what comes before the first scene', () => {
    const moved = moveScene(lines, scenes, 2, 0)
    expect(moved.lines).toEqual([
      'Title: Test',
      '',
      'INT. C - DAY',
      '',
      'Three.',
      '',
      'INT. A - DAY',
      '',
      'One.',
      '',
      'INT. B - DAY',
      '',
      'Two.'
    ])
    expect(moved.line).toBe(2)
  })

  it('moves a scene down to the end', () => {
    const moved = moveScene(lines, scenes, 0, 2)
    expect(headings(moved.lines)).toEqual(['INT. B - DAY', 'INT. C - DAY', 'INT. A - DAY'])
    expect(moved.lines[moved.line]).toBe('INT. A - DAY')
    expect(moved.lines.at(-1)).toBe('One.')
  })

  it('moves back to the original text', () => {
    const there = moveScene(lines, scenes, 0, 2).lines
    expect(moveScene(there, outlineScenes(there), 2, 0).lines).toEqual(lines)
  })

  it('keeps the trailing blank lines of the document at its end', () => {
    const trailing = [...lines, '', '']
    const moved = moveScene(trailing, outlineScenes(trailing), 2, 1).lines
    expect(moved.slice(-3)).toEqual(['Two.', '', ''])
    expect(headings(moved)).toEqual(['INT. A - DAY', 'INT. C - DAY', 'INT. B - DAY'])
  })

  it('does nothing when the scene stays in place', () => {
    expect(moveScene(lines, scenes, 1, 1).lines).toBe(lines)
  })
})
