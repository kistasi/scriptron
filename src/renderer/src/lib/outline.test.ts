import { describe, expect, it } from 'vitest'
import { filterScenes, outlineScenes, sceneAt } from './outline'

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
