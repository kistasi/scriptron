// @vitest-environment jsdom
import { type Completion, CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { sceneHeadingCompletions, sceneTimeCompletions } from './sceneHeadingCompletion'

// Completion labels with the cursor at the end of the text.
const labels =
  (source: typeof sceneHeadingCompletions) =>
  (text: string): string[] | undefined => {
    const state = EditorState.create({ doc: text })
    return source(new CompletionContext(state, text.length, false))?.options.map((o) => o.label)
  }
const complete = labels(sceneHeadingCompletions)
const completeTime = labels(sceneTimeCompletions)

describe('sceneHeadingCompletions', () => {
  const script = 'INT. HOUSE - DAY\n\nHe sits.\n\nEXT. ROAD - DUSK\n\n'

  it('offers prefixes for the capitals that start one', () => {
    expect(complete(`${script}I`)).toEqual(['INT.', 'INT./EXT.', 'I/E.'])
    expect(complete(`${script}EX`)).toEqual(['EXT.'])
    expect(complete(`${script}.e`)).toEqual(['EXT.', 'EST.'])
  })

  it('stays out of action and dialogue', () => {
    expect(complete(`${script}In`)).toBeUndefined()
    expect(complete(`${script}He sits.\nI`)).toBeUndefined()
  })

  it('offers the locations in the script after a prefix', () => {
    expect(complete(`${script}INT. `)).toEqual(['HOUSE', 'ROAD'])
    expect(complete(`${script}ext. ro`)).toEqual(['HOUSE', 'ROAD'])
    expect(complete(`${script}INT. ROAD`)).toEqual(['HOUSE'])
  })
})

describe('sceneTimeCompletions', () => {
  const script = 'INT. HOUSE - DAY\n\nHe sits.\n\nEXT. ROAD - DUSK\n\n'

  it('offers the times of day after the location', () => {
    expect(completeTime(`${script}INT. HOUSE - `)).toEqual([
      'DAY',
      'DUSK',
      'NIGHT',
      'MORNING',
      'EVENING',
      'CONTINUOUS',
      'LATER'
    ])
    expect(completeTime(`${script}.DREAM - N`)).toContain('NIGHT')
  })

  it('needs a heading with a location', () => {
    expect(completeTime(`${script}INT. HOUSE`)).toBeUndefined()
    expect(completeTime(`${script}BOB - `)).toBeUndefined()
  })
})

describe('picking a completion', () => {
  // The line after picking the first option offered for the typed text.
  const pick = (source: typeof sceneHeadingCompletions, text: string, label: string): string => {
    const view = new EditorView({ doc: text, selection: { anchor: text.length } })
    const result = source(new CompletionContext(view.state, text.length, false))!
    const option = result.options.find((o) => o.label === label)!
    const apply = option.apply as (v: EditorView, c: Completion, from: number, to: number) => void
    apply(view, option, result.from, text.length)
    const line = view.state.doc.lineAt(view.state.selection.main.head)
    view.destroy()
    return line.text
  }

  it('writes the whole heading in capitals', () => {
    const script = 'int. house - day\n\n'
    expect(pick(sceneHeadingCompletions, `${script}ext. ho`, 'HOUSE')).toBe('EXT. HOUSE - ')
    expect(pick(sceneTimeCompletions, `${script}.dream - n`, 'NIGHT')).toBe('.DREAM - NIGHT')
    expect(pick(sceneHeadingCompletions, `${script}.i`, 'INT.')).toBe('.INT. ')
  })
})
