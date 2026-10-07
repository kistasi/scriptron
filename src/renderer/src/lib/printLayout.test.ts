import { describe, expect, it } from 'vitest'
import { expandTemplates, layoutScreenplay, type PrintedPage, type Row } from './printLayout'

const now = new Date(2026, 8, 19)

// Each row as "type: text", blank rows as "".
function rows(page: PrintedPage): string[] {
  return page.rows.map((row: Row | null) =>
    row === null ? '' : `${row.type}: ${row.spans.map((span) => span.text).join('')}`
  )
}

describe('layoutScreenplay', () => {
  it('lays out the title page', () => {
    const { title, titlePage, pages } = layoutScreenplay(
      [
        'Title: boomer',
        'Credit: Írta',
        'Author: Tasnádi Márton',
        'Contact:',
        '    marton.tasnadi@gmail.com',
        'Draft date: {{date YYYY-MM-dd}}',
        '',
        'Action.'
      ].join('\n'),
      now
    )
    expect(title).toBe('boomer')
    expect(titlePage).toEqual({
      center: [
        [{ text: 'BOOMER' }],
        [],
        [],
        [],
        [{ text: 'Írta' }],
        [],
        [{ text: 'Tasnádi Márton' }]
      ],
      bottomLeft: [[{ text: 'marton.tasnadi@gmail.com' }]],
      bottomRight: [[{ text: '2026-09-19' }]]
    })
    expect(pages.map((page) => page.number)).toEqual([null])
    expect(rows(pages[0])).toEqual(['action: Action.'])
  })

  it('prints elements without Fountain syntax, with emphasis and scene numbers', () => {
    const [page] = layoutScreenplay(
      [
        '.FLASHBACK #7#',
        '',
        '!Some *quiet* **loud** _underlined_ \\*not\\* action [[a note]].',
        '',
        '@McCoy ^',
        '(beat)',
        'Hi.',
        '',
        '> CUT TO:',
        '',
        '> THE END <'
      ].join('\n')
    ).pages
    expect(rows(page)).toEqual([
      'scene-heading: FLASHBACK',
      '',
      'action: Some quiet loud underlined *not* action .',
      '',
      'character: McCoy',
      'parenthetical: (beat)',
      'dialogue: Hi.',
      '',
      'transition: CUT TO:',
      '',
      'centered: THE END'
    ])
    expect(page.rows[0]?.scene).toBe('7')
    expect(page.rows[2]?.spans.slice(0, 6)).toEqual([
      { text: 'Some ' },
      { text: 'quiet', italic: true },
      { text: ' ' },
      { text: 'loud', bold: true },
      { text: ' ' },
      { text: 'underlined', underline: true }
    ])
  })

  it('wraps rows to the element’s column', () => {
    const [page] = layoutScreenplay(`BOB\n${'word '.repeat(10).trim()}`).pages
    // Dialogue is 35 characters wide.
    expect(rows(page)).toEqual([
      'character: BOB',
      'dialogue: word word word word word word word ',
      'dialogue: word word word'
    ])
  })

  it('leaves out sections, synopses, notes and boneyard, without doubling blank lines', () => {
    const text = [
      '# Act 1',
      '',
      '= Synopsis',
      '',
      'Action.',
      '',
      '[[note]]',
      '',
      '/* gone */',
      '',
      'More.'
    ]
    expect(rows(layoutScreenplay(text.join('\n')).pages[0])).toEqual([
      'action: Action.',
      '',
      'action: More.'
    ])
  })

  it('adds a blank row above scene headings, and numbers pages from the second', () => {
    const scene = (n: number): string[] => [`INT. ROOM ${n} - DAY`, '', ...Array(25).fill('Word.')]
    const { pages } = layoutScreenplay([...scene(1), '', ...scene(2), '', ...scene(3)].join('\n'))
    expect(pages.map((page) => page.number)).toEqual([null, 2])
    expect(rows(pages[0]).slice(26, 30)).toEqual([
      'action: Word.',
      '',
      '',
      'scene-heading: INT. ROOM 2 - DAY'
    ])
    // At the top of a page there is no extra row.
    expect(rows(pages[1])[0]).toBe('scene-heading: INT. ROOM 3 - DAY')
  })

  it('continues a speech on the next page with (MORE) and (CONT’D)', () => {
    const text = [
      ...Array(53).fill('Word.'),
      '',
      'BOB',
      ...Array.from({ length: 6 }, (_, n) => `Line ${n}.`)
    ]
    const { pages } = layoutScreenplay(text.join('\n'))
    expect(rows(pages[0]).slice(-5)).toEqual([
      'character: BOB',
      'dialogue: Line 0.',
      'dialogue: Line 1.',
      'dialogue: Line 2.',
      'more: (MORE)'
    ])
    expect(rows(pages[1]).slice(0, 2)).toEqual(["character: BOB (CONT'D)", 'dialogue: Line 3.'])
  })
})

describe('expandTemplates', () => {
  it('expands {{date}} with a format', () => {
    expect(expandTemplates('{{date YYYY-MM-dd}}', now)).toBe('2026-09-19')
    expect(expandTemplates('Draft {{date d.M.yyyy}}', now)).toBe('Draft 19.9.2026')
    expect(expandTemplates('{{date}}', now)).toBe('2026-09-19')
  })
})
