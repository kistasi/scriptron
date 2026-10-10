import { describe, expect, it } from 'vitest'
import { isChecked, namePattern, uncheckedRanges } from './spellcheck'

const unchecked = (text: string, names: string[] = []): string[] =>
  uncheckedRanges(text, 'action', namePattern(names)).map(({ from, to }) => text.slice(from, to))

describe('isChecked', () => {
  it('checks prose and skips headings, cues, transitions and notes', () => {
    expect(isChecked('action')).toBe(true)
    expect(isChecked('dialogue')).toBe(true)
    expect(isChecked('scene-heading')).toBe(false)
    expect(isChecked('character')).toBe(false)
    expect(isChecked('transition')).toBe(false)
    expect(isChecked('note')).toBe(false)
    expect(isChecked('title-page')).toBe(false)
  })
})

describe('uncheckedRanges', () => {
  it('skips markup and inline notes', () => {
    expect(unchecked('He is *very* tired.')).toEqual(['*', '*'])
    expect(unchecked('Go [[maybe stay]] home.')).toEqual(['[[maybe stay]]'])
  })

  it("skips the words of characters' names, in any case and with a possessive", () => {
    expect(unchecked('Jaxxon meets Zorg’s cat and ZORG.', ['JAXXON ZORG'])).toEqual([
      'Jaxxon',
      'Zorg’s',
      'ZORG'
    ])
    expect(unchecked('Bálint és BÁLINT, nem Bálintka.', ['BÁLINT'])).toEqual(['Bálint', 'BÁLINT'])
  })

  it('treats names as text, not patterns', () => {
    expect(unchecked('Jean-Luc nods to Jean.', ['JEAN-LUC'])).toEqual(['Jean-Luc'])
  })
})
