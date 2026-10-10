import { describe, expect, it } from 'vitest'
import { classifyLines } from './fountainLines'
import { commonTimes, headingParts, parseHeading } from './sceneHeadings'

describe('parseHeading', () => {
  it('splits the location from the time of day at the last dash', () => {
    expect(parseHeading('INT. HOUSE - KITCHEN - DAY #12A#')).toEqual({
      location: 'HOUSE - KITCHEN',
      time: 'DAY'
    })
    expect(parseHeading('int./ext. car - night')).toEqual({ location: 'car', time: 'night' })
    expect(parseHeading('I/E VAN')).toEqual({ location: 'VAN', time: null })
    expect(parseHeading('.FLASHBACK')).toEqual({ location: 'FLASHBACK', time: null })
  })
})

describe('headingParts', () => {
  it('lists locations and times by frequency, skipping the given line', () => {
    const lines = 'EXT. ROAD - DUSK\n\nINT. HOUSE - DAY\n\nINT. HOUSE - DUSK\n\nEXT. FIELD'.split(
      '\n'
    )
    const types = classifyLines(lines)
    expect(headingParts(lines, types)).toEqual({
      locations: ['HOUSE', 'ROAD', 'FIELD'],
      times: ['DUSK', ...commonTimes]
    })
    expect(headingParts(lines, types, 6).locations).toEqual(['HOUSE', 'ROAD'])
  })

  it('puts them in capitals', () => {
    const lines = 'int. car - night\n\nEXT. CAR - NIGHT'.split('\n')
    expect(headingParts(lines, classifyLines(lines))).toEqual({
      locations: ['CAR'],
      times: ['NIGHT', ...commonTimes.filter((time) => time !== 'NIGHT')]
    })
  })
})
