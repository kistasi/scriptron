import { describe, expect, it } from 'vitest'
import { classifyLines } from './fountainLines'
import { paginate } from './screenplayLayout'

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
