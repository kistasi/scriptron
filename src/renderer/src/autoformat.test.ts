// @vitest-environment jsdom
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { autoformat } from './autoformat'

// The document after autoformatting, with the cursor (marked "|") where it ends up.
function run(text: string): string {
  const cursor = Math.max(text.indexOf('|'), 0)
  const view = new EditorView({ doc: text.replace('|', ''), selection: { anchor: cursor } })
  autoformat(view)
  const result = view.state.doc.toString()
  const { head } = view.state.selection.main
  view.destroy()
  return `${result.slice(0, head)}|${result.slice(head)}`
}

describe('autoformat', () => {
  it('trims spaces at the ends of lines and collapses them inside', () => {
    expect(run('|  INT.  HOUSE -\tDAY  \n\nBob   runs.   ')).toBe(
      '|INT. HOUSE - DAY\n\nBob runs.\n'
    )
  })

  it('puts scene headings in capitals, except for notes', () => {
    expect(run('int.  ho|use - day\n\nBob runs.')).toBe('INT. HO|USE - DAY\n\nBob runs.\n')
    expect(run('.dream [[check this]]|\n\nAction.')).toBe('.DREAM [[check this]]|\n\nAction.\n')
    expect(run('|ext.  straße - day\n\nAction.')).toBe('|EXT. STRASSE - DAY\n\nAction.\n')
  })

  it('collapses runs of blank lines into one', () => {
    expect(run('|One.\n\n\n  \n\nTwo.')).toBe('|One.\n\nTwo.\n')
  })

  it('removes blank lines at the start and keeps one newline at the end', () => {
    expect(run('\n\n|One.\n\n\n')).toBe('|One.\n')
    expect(run('|\n  \n')).toBe('|')
  })

  it('adds a newline at the end when there is none', () => {
    expect(run('One.\n\nTwo.|')).toBe('One.\n\nTwo.|\n')
    expect(run('|One.\n')).toBe('|One.\n')
    expect(run('|/* Old */')).toBe('|/* Old */\n')
  })

  it('keeps the cursor in its place in the text', () => {
    expect(run('One.\n\n\n\nTw|o  words.')).toBe('One.\n\nTw|o words.\n')
  })

  it('keeps the two spaces that continue a speech', () => {
    expect(run('|BOB\nHello.\n  \nStill me.  ')).toBe('|BOB\nHello.\n  \nStill me.\n')
  })

  it('keeps the indentation of title page values', () => {
    expect(run('|Title:  \n    Big  Fish\n\n\n\nAction.')).toBe(
      '|Title:\n    Big Fish\n\nAction.\n'
    )
  })

  it('leaves the boneyard alone', () => {
    expect(run('|/*  Old\n\n\n  draft */\n\n\nAction.')).toBe(
      '|/*  Old\n\n\n  draft */\n\nAction.\n'
    )
  })
})
