import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { characterCompletions } from './characterCompletion'

// Completion labels with the cursor at the end of the text.
const complete = (text: string): string[] | undefined => {
  const state = EditorState.create({ doc: text })
  const result = characterCompletions(new CompletionContext(state, text.length, false))
  return result?.options.map((option) => option.label)
}

describe('characterCompletions', () => {
  const script = 'ALICE\nHi.\n\nBOB\nHello.\n\nBob waves.\n\n'

  it('offers the speakers for an all-caps line after a blank line', () => {
    expect(complete(`${script}B`)).toEqual(['ALICE', "BOB (CONT'D)"])
    expect(complete(`${script}A`)).toEqual(['ALICE', "BOB (CONT'D)"])
  })

  it('works for forced cues', () => {
    expect(complete(`${script}@b`)).toEqual(['ALICE', "BOB (CONT'D)"])
  })

  it('stays out of action and dialogue', () => {
    expect(complete(`${script}Bo`)).toBeUndefined()
    expect(complete('ALICE\nHi.\nB')).toBeUndefined()
  })

  it('does not offer a name that is already typed in full', () => {
    expect(complete('BOB\nHi.\n\nALICE\nHello.\n\nALICE')).toEqual(['BOB', "ALICE (CONT'D)"])
    expect(complete('ALICE\nHi.\n\nBOB\nHello.\n\nALICE')).toEqual(["BOB (CONT'D)"])
  })
})
