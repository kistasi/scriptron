// @vitest-environment jsdom
import { Compartment } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { spellcheck } from './spellcheck'

let view: EditorView
const checking = new Compartment()

function setup(doc: string, enabled = true): void {
  view = new EditorView({ doc, extensions: [checking.of(spellcheck(enabled))] })
}

afterEach(() => view.destroy())

// The text of the elements Chromium is told not to check, leaving out blank lines.
const unchecked = (): string[] =>
  [...view.contentDOM.querySelectorAll('[spellcheck="false"]')]
    .map((element) => element.textContent ?? '')
    .filter(Boolean)

describe('spellcheck', () => {
  it("checks the screenplay's prose, but not headings, cues or names", () => {
    setup('INT. HOUSE - DAY\n\nMÁRK\nHello there.\n\nMárk walks in.')
    expect(view.contentDOM.getAttribute('spellcheck')).toBe('true')
    expect(unchecked()).toEqual(['INT. HOUSE - DAY', 'MÁRK', 'Márk'])
  })

  it('turns off', () => {
    setup('Hello.')
    view.dispatch({ effects: checking.reconfigure(spellcheck(false)) })
    expect(view.contentDOM.getAttribute('spellcheck')).toBe('false')
  })
})
