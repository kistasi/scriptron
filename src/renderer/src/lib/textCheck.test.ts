import { describe, expect, it } from 'vitest'
import type { TextIssue } from '../../../shared/ipc'
import { acceptedWords, checkableText, ignoreKey, shownIssues } from './textCheck'

const spelling = (from: number, to: number): TextIssue => ({ kind: 'spelling', from, to })

describe('checkableText', () => {
  it('checks prose and skips headings, cues, transitions and notes', () => {
    expect(checkableText('Bob runs.', 'action')).toBe('Bob runs.')
    expect(checkableText('Hello there.', 'dialogue')).toBe('Hello there.')
    expect(checkableText('INT. HOUSE - DAY', 'scene-heading')).toBeNull()
    expect(checkableText('BOB', 'character')).toBeNull()
    expect(checkableText('CUT TO:', 'transition')).toBeNull()
    expect(checkableText('[[Fix this]]', 'note')).toBeNull()
    expect(checkableText('Title: Big Fish', 'title-page')).toBeNull()
  })

  it('blanks out markup and inline notes, keeping offsets', () => {
    expect(checkableText('He is *very* _tired_.', 'action')).toBe('He is  very   tired .')
    expect(checkableText('Go [[maybe stay]] home.', 'dialogue')).toBe('Go                home.')
    expect(checkableText('!Forced action.', 'action')).toBe(' Forced action.')
    expect(checkableText('> THE END <', 'centered')).toBe('  THE END  ')
    expect(checkableText('~Happy birthday', 'dialogue')).toBe(' Happy birthday')
  })

  it('skips lines with nothing left to check', () => {
    expect(checkableText('[[Only a note]]', 'action')).toBeNull()
  })
})

describe('shownIssues', () => {
  const text = 'Jaxxon meets Zorg’s cat.'
  const issues = [spelling(0, 6), spelling(13, 19)]

  it('accepts dictionary words regardless of case and possessives', () => {
    expect(shownIssues(issues, text, acceptedWords(['ZORG'], []), new Set())).toEqual([
      spelling(0, 6)
    ])
  })

  it("accepts the words of characters' names", () => {
    expect(shownIssues(issues, text, acceptedWords([], ['Jaxxon Zorg']), new Set())).toEqual([])
  })

  it('leaves out ignored issues', () => {
    const ignored = new Set([ignoreKey(spelling(0, 6), text)])
    expect(shownIssues(issues, text, new Set(), ignored)).toEqual([spelling(13, 19)])
  })

  it('ignores a misspelling everywhere, but a grammar issue only where it is', () => {
    const grammar: TextIssue = { kind: 'grammar', from: 0, to: 1, message: 'Consider ‘an’' }
    expect(ignoreKey(spelling(0, 6), text)).toBe(ignoreKey(spelling(4, 10), 'The Jaxxon'))
    expect(ignoreKey(grammar, 'a apple')).not.toBe(ignoreKey(grammar, 'a orange'))
  })
})
