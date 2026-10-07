import { describe, expect, it } from 'vitest'
import { classifyLines } from './fountainLines'
import {
  LINES_PER_PAGE,
  paginate,
  rowStarts,
  sceneNumbers,
  type Pagination
} from './screenplayLayout'

// Generates varied screenplays from a seeded PRNG, so every run produces the same scripts:
// title pages, forced elements, boneyard, notes, explicit page breaks, and speeches long
// enough to be split across pages with (MORE) / (CONT'D).
function scriptGenerator(seed: number): () => string {
  const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)]
  const words = (
    'the a quick brown fox jumps over lazy dog. Really? Yes! "Fine." and then she *walks* ' +
    '**away** _slowly_ [[note here]] … pneumonoultramicroscopicsilicovolcanoconiosis'
  ).split(' ')
  const sentence = (n: number): string => Array.from({ length: n }, () => pick(words)).join(' ')

  return () => {
    const out: string[] = []
    if (rand() < 0.5) out.push('Title: Test', 'Credit: by', 'Author: Me', '    Second line', '')
    for (let scene = 0; scene < 40; scene++) {
      out.push(
        pick([
          'INT. HOUSE - DAY',
          'EXT. ROAD - NIGHT #12A#',
          '.FORCED HEADING',
          'int./ext. car',
          'I/E VAN'
        ]),
        ''
      )
      for (let block = 0; block < 6; block++) {
        const r = rand()
        if (r < 0.35) {
          out.push(pick(['BOB', 'MÁRK (V.O.)', '@mcCoy', "ALICE (CONT'D)", 'BOB ^']))
          const lines = 1 + Math.floor(rand() * 6)
          for (let k = 0; k < lines; k++) {
            if (rand() < 0.25) out.push('(beat)')
            else if (rand() < 0.1) out.push('  ')
            else out.push(sentence(3 + Math.floor(rand() * 60)))
          }
        } else if (r < 0.6) out.push(sentence(5 + Math.floor(rand() * 80)))
        else if (r < 0.65) out.push('CUT TO:')
        else if (r < 0.68) out.push('> THE END <')
        else if (r < 0.71) out.push('===')
        else if (r < 0.74) out.push('# Act ' + block)
        else if (r < 0.77) out.push('= synopsis ' + sentence(4))
        else if (r < 0.8) out.push('/* bone', sentence(5), 'yard */')
        else if (r < 0.83) out.push('[[a note]]')
        else if (r < 0.86) out.push('!FORCED ACTION', '> to the right')
        else out.push(sentence(2), '', '')
        out.push('')
      }
    }
    return out.join('\n')
  }
}

describe('paginate', () => {
  it('matches the pagination snapshot for generated screenplays', () => {
    const generate = scriptGenerator(42)
    const scripts = Array.from({ length: 10 }, () => {
      const lines = generate().split('\n')
      const { breaks, remaining } = paginate(lines, classifyLines(lines))
      // One line per break: "page 2 at 57:0, 3 left, cont: BOB (CONT'D)"
      return [
        ...breaks.map(
          (b) =>
            `page ${b.page} at ${b.line}:${b.offset}, ${b.remaining} left` +
            (b.continued ? `, cont: ${b.continued}` : '')
        ),
        `end, ${remaining} left`
      ]
    })
    expect(scripts).toMatchSnapshot()
  })
})

const layout = (lines: string[]): Pagination => paginate(lines, classifyLines(lines))
const repeat = (count: number, line: (n: number) => string): string[] =>
  Array.from({ length: count }, (_, n) => line(n + 1))

describe('rowStarts', () => {
  it('wraps at word boundaries like the browser', () => {
    expect(rowStarts('', 10)).toEqual([0])
    expect(rowStarts('aaa bbb', 7)).toEqual([0])
    expect(rowStarts('aaa bbb ccc', 7)).toEqual([0, 8])
  })

  it('breaks after a hyphen between letters', () => {
    expect(rowStarts('aaa bbb-ccc', 8)).toEqual([0, 8])
    expect(rowStarts('aaa bbb-ccc', 6)).toEqual([0, 4, 8])
    expect(rowStarts('aaa bbb-123', 8)).toEqual([0, 4])
  })

  it('breaks words longer than the line', () => {
    expect(rowStarts('abcdefghij', 4)).toEqual([0, 4, 8])
    expect(rowStarts('ab abcdefgh', 4)).toEqual([0, 3, 7])
  })
})

describe('paginate rules', () => {
  const none = new Set<number>()

  it('has a page of 59 lines', () => {
    expect(LINES_PER_PAGE).toBe(59)
    expect(layout([])).toEqual({ breaks: [], spacedHeadings: none, remaining: 59 })
  })

  it('starts a new page when a page is full', () => {
    expect(layout(repeat(65, () => 'word'))).toEqual({
      breaks: [{ line: 59, offset: 0, page: 2, remaining: 0, continued: undefined }],
      spacedHeadings: none,
      remaining: 53
    })
  })

  it('counts wrapped rows of long lines', () => {
    // 61 characters in a 60 character column take 2 rows: a word and 29 of them fill a page.
    const long = 'x'.repeat(61)
    expect(layout(['word', ...repeat(29, () => long)])).toEqual({
      breaks: [],
      spacedHeadings: none,
      remaining: 0
    })
    expect(layout(['word', ...repeat(30, () => long)]).breaks.map((b) => b.line)).toEqual([30])
  })

  it('puts the title page on a page of its own', () => {
    // The blank line after the title page is shown on it too, leaving 56 lines.
    expect(layout(['Title: Big Fish', 'Author: John August', '', 'Action.'])).toEqual({
      breaks: [{ line: 3, offset: 0, page: 1, remaining: 56 }],
      spacedHeadings: none,
      remaining: 58
    })
  })

  it('starts a new page after === at the next content', () => {
    expect(layout(['Before.', '', '===', '', 'After.'])).toEqual({
      breaks: [{ line: 4, offset: 0, page: 2, remaining: 56, continued: undefined }],
      spacedHeadings: none,
      remaining: 58
    })
  })

  it('puts an extra blank row above scene headings, except at the top of a page', () => {
    const scene = ['INT. HOUSE - DAY', '', 'Action.']
    expect(layout([...scene, '', ...scene])).toEqual({
      breaks: [],
      spacedHeadings: new Set([4]),
      // 3 + 1 + (1 + 3) lines
      remaining: 51
    })
  })

  it('keeps a scene heading with the start of what follows', () => {
    // 55 lines used: the heading, its extra row, the blank line and a line of action fit...
    const before = [...repeat(54, () => 'word'), '']
    expect(layout([...before, 'INT. HOUSE - DAY', '', 'Action.'])).toEqual({
      breaks: [],
      spacedHeadings: new Set([55]),
      remaining: 0
    })
    // ...but not after one more line, though the line of action alone would.
    const more = [...before, 'word', '']
    expect(layout([...more, 'Action.']).breaks).toEqual([])
    expect(layout([...more, 'INT. HOUSE - DAY', '', 'Action.'])).toEqual({
      breaks: [{ line: 57, offset: 0, page: 2, remaining: 2, continued: undefined }],
      spacedHeadings: none,
      remaining: 56
    })
  })

  // 53 lines of action and a blank line leave 5 lines on the page, one of them for (MORE).
  const nearlyFullPage = [...repeat(53, () => 'word'), '']
  const speech = (cue: string, lines: string[]): string[] => [...nearlyFullPage, cue, ...lines]

  it('splits a speech between lines with (MORE) and (CONT’D)', () => {
    const lines = speech(
      'BOB (V.O.)',
      repeat(10, (n) => `Line ${n}.`)
    )
    expect(layout(lines)).toEqual({
      breaks: [{ line: 58, offset: 0, page: 2, remaining: 0, continued: "BOB (V.O.) (CONT'D)" }],
      spacedHeadings: none,
      // The (CONT'D) cue and the 7 remaining lines.
      remaining: 51
    })
  })

  it('repeats the cue without Fountain syntax or an existing (CONT’D)', () => {
    const continued = (cue: string): string | undefined =>
      layout(
        speech(
          cue,
          repeat(10, (n) => `Line ${n}.`)
        )
      ).breaks[0].continued
    expect(continued('@McCoy ^')).toBe("McCoy (CONT'D)")
    expect(continued("BOB (CONT'D)")).toBe("BOB (CONT'D)")
  })

  it('never ends a page right after a parenthetical', () => {
    const lines = speech('BOB', ['Line 1.', 'Line 2.', '(beat)', ...repeat(8, (n) => `More ${n}.`)])
    // The page ends before the parenthetical, not after it with one more line.
    expect(layout(lines).breaks).toEqual([
      { line: 57, offset: 0, page: 2, remaining: 1, continued: "BOB (CONT'D)" }
    ])
  })

  it('moves a speech to the next page when two lines of it do not fit', () => {
    const lines = [...repeat(55, () => 'word'), '', 'BOB', ...repeat(10, (n) => `Line ${n}.`)]
    expect(layout(lines).breaks).toEqual([
      { line: 56, offset: 0, page: 2, remaining: 3, continued: undefined }
    ])
  })

  it('splits a long dialogue line after a sentence', () => {
    const paragraph = repeat(20, (n) => `This is sentence number ${n}.`).join(' ')
    const lines = speech('BOB', [paragraph])
    const [split] = layout(lines).breaks
    expect(split).toMatchObject({ line: 55, page: 2, continued: "BOB (CONT'D)" })
    expect(paragraph.slice(0, split.offset)).toMatch(/\. $/)
  })

  it('splits a speech longer than a page across several pages', () => {
    const lines = ['BOB', ...repeat(120, (n) => `Line ${n}.`)]
    // Each full page holds the cue, 57 lines and (MORE).
    expect(layout(lines)).toEqual({
      breaks: [
        { line: 58, offset: 0, page: 2, remaining: 0, continued: "BOB (CONT'D)" },
        { line: 115, offset: 0, page: 3, remaining: 0, continued: "BOB (CONT'D)" }
      ],
      spacedHeadings: none,
      remaining: 52
    })
  })
})

describe('sceneNumbers', () => {
  it('numbers scene headings in order, using explicit numbers where given', () => {
    const lines = ['INT. HOUSE - DAY', '', 'EXT. ROAD #12A#', '', '.FLASHBACK', '']
    expect(sceneNumbers(lines, classifyLines(lines))).toEqual(
      new Map([
        [0, '1'],
        [2, '12A'],
        [4, '3']
      ])
    )
  })
})
