import { describe, expect, it } from 'vitest'
import { classifyLines, inlineRanges, type InlineRange, type LineType } from './fountainLines'

const classify = (text: string): LineType[] => classifyLines(text.split('\n'))

describe('classifyLines', () => {
  it('recognises scene headings surrounded by blank lines, in any case', () => {
    for (const heading of [
      'INT. HOUSE - DAY',
      'EXT. ROAD - NIGHT',
      'EST. CITY',
      'INT./EXT. CAR',
      'INT/EXT CAR',
      'I/E VAN',
      'int. house - day'
    ]) {
      expect(classify(`${heading}\n\nAction.`), heading).toEqual([
        'scene-heading',
        'empty',
        'action'
      ])
    }
  })

  it('needs a blank line after a scene heading', () => {
    expect(classify('INT. HOUSE - DAY\nAction.')[0]).not.toBe('scene-heading')
  })

  it('does not treat words that start like a heading as one', () => {
    expect(classify('Interior design.\n\nAction.')[0]).toBe('action')
  })

  it('forces a scene heading with a leading period, but not an ellipsis', () => {
    expect(classify('.FLASHBACK\n\nAction.')[0]).toBe('scene-heading')
    expect(classify('...and then\n\nAction.')[0]).toBe('action')
  })

  it('classifies a speech: character, parenthetical and dialogue up to a blank line', () => {
    expect(classify('BOB\n(quietly)\nHello.\nStill talking.\n\nAction.')).toEqual([
      'character',
      'parenthetical',
      'dialogue',
      'dialogue',
      'empty',
      'action'
    ])
  })

  it('keeps a speech going across a line of two spaces', () => {
    expect(classify('BOB\nFirst.\n  \nSecond.')).toEqual([
      'character',
      'dialogue',
      'dialogue',
      'dialogue'
    ])
  })

  it('recognises character names with extensions, accents and dual dialogue markers', () => {
    for (const cue of ['MÁRK', 'BOB (V.O.)', "BOB (cont'd)", 'BOB ^', 'R2-D2']) {
      expect(classify(`${cue}\nHello.`)[0], cue).toBe('character')
    }
  })

  it('forces a character with @, even in mixed case', () => {
    expect(classify('@McCoy\nHello.')[0]).toBe('character')
  })

  it('treats an uppercase line without dialogue after it as action', () => {
    expect(classify('BOOM!\n\nAction.')[0]).toBe('action')
  })

  it('needs a blank line before a character', () => {
    expect(classify('He shouts:\nBOB\nHello.')).toEqual(['action', 'action', 'action'])
  })

  it('recognises transitions, forced transitions and centered text', () => {
    expect(classify('\nCUT TO:\n')[1]).toBe('transition')
    expect(classify('> FADE OUT.')[0]).toBe('transition')
    expect(classify('> THE END <')[0]).toBe('centered')
  })

  it('needs a transition ending in TO: to be uppercase', () => {
    expect(classify('\nHe walks to:\n')[1]).toBe('action')
  })

  it('forces action with !', () => {
    expect(classify('!INT. HOUSE - DAY\n\nAction.')[0]).toBe('action')
    expect(classify('!BOB\nHello.')).toEqual(['action', 'action'])
  })

  it('recognises sections, synopses, notes and page breaks', () => {
    expect(classify('# Act One\n\n= He arrives.\n\n[[A note.]]\n\n===')).toEqual([
      'section',
      'empty',
      'synopsis',
      'empty',
      'note',
      'empty',
      'page-break'
    ])
  })

  it('marks everything from /* to */ as boneyard', () => {
    expect(classify('/* cut\nBOB\nHello.\n*/\nAction.')).toEqual([
      'boneyard',
      'boneyard',
      'boneyard',
      'boneyard',
      'action'
    ])
    expect(classify('/* cut */\nAction.')).toEqual(['boneyard', 'action'])
  })

  it('reads a title page up to the first blank line, only at the start', () => {
    expect(classify('Title: Big Fish\nAuthor: John August\n    and someone\n\nAction.')).toEqual([
      'title-page',
      'title-page',
      'title-page',
      'empty',
      'action'
    ])
    expect(classify('Action.\n\nTitle: Not a title page')[2]).toBe('action')
  })

  it('handles empty and blank documents', () => {
    expect(classifyLines([])).toEqual([])
    expect(classify('')).toEqual(['empty'])
    expect(classify('   ')).toEqual(['empty'])
  })
})

describe('inlineRanges', () => {
  const ranges = (text: string, type: LineType = 'action'): InlineRange[] =>
    [...inlineRanges(text, type)].sort((a, b) => a.from - b.from || a.to - b.to)

  it('marks emphasis and dims its delimiters', () => {
    expect(ranges('**bold**')).toEqual([
      { from: 0, to: 2, style: 'marker' },
      { from: 0, to: 8, style: 'bold' },
      { from: 6, to: 8, style: 'marker' }
    ])
    expect(ranges('*it*')).toEqual([
      { from: 0, to: 1, style: 'marker' },
      { from: 0, to: 4, style: 'italic' },
      { from: 3, to: 4, style: 'marker' }
    ])
    expect(ranges('_under_')).toEqual([
      { from: 0, to: 1, style: 'marker' },
      { from: 0, to: 7, style: 'underline' },
      { from: 6, to: 7, style: 'marker' }
    ])
  })

  it('treats *** as bold italic only', () => {
    expect(ranges('***both***').filter((r) => r.style !== 'marker')).toEqual([
      { from: 0, to: 10, style: 'bold' },
      { from: 0, to: 10, style: 'italic' }
    ])
  })

  it('ignores escaped and space-padded delimiters', () => {
    expect(ranges('\\*not italic\\*')).toEqual([])
    expect(ranges('2 * 3 * 4')).toEqual([])
  })

  it('marks inline notes', () => {
    expect(ranges('He waits. [[Too long?]]')).toEqual([{ from: 10, to: 23, style: 'note' }])
  })

  it('dims leading and trailing syntax characters', () => {
    expect(ranges('.FLASHBACK', 'scene-heading')).toEqual([{ from: 0, to: 1, style: 'marker' }])
    expect(ranges('INT. HOUSE #12A#', 'scene-heading')).toEqual([
      { from: 10, to: 16, style: 'marker' }
    ])
    expect(ranges('@McCoy ^', 'character')).toEqual([
      { from: 0, to: 1, style: 'marker' },
      { from: 6, to: 8, style: 'marker' }
    ])
    expect(ranges('> THE END <', 'centered')).toEqual([
      { from: 0, to: 2, style: 'marker' },
      { from: 9, to: 11, style: 'marker' }
    ])
    expect(ranges('  # Act One', 'section')).toEqual([{ from: 2, to: 4, style: 'marker' }])
  })

  it('leaves boneyard and empty lines unstyled', () => {
    expect(inlineRanges('**not bold**', 'boneyard')).toEqual([])
    expect(inlineRanges('', 'empty')).toEqual([])
  })
})
