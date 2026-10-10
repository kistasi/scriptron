// @vitest-environment jsdom
import { EditorView } from '@codemirror/view'
import type { Command } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { insertPageBreak, isCentered, toggleCentered } from './lineFormats'

// Marks the cursor with "|", or the selection with "[" and "]".
function viewOf(text: string): EditorView {
  const cursor = text.indexOf('|')
  if (cursor >= 0) {
    return new EditorView({ doc: text.replace('|', ''), selection: { anchor: cursor } })
  }
  const from = text.indexOf('[')
  const to = text.indexOf(']') - 1
  return new EditorView({
    doc: text.replace('[', '').replace(']', ''),
    selection: { anchor: from, head: to }
  })
}

// The document after running command, with the cursor marked if the selection is empty.
function run(command: Command, text: string): string {
  const view = viewOf(text)
  command(view)
  const { doc, selection } = view.state
  const result = doc.toString()
  const { head, empty } = selection.main
  view.destroy()
  return empty ? `${result.slice(0, head)}|${result.slice(head)}` : result
}

describe('toggleCentered', () => {
  it('centers the cursor line or the selected lines', () => {
    expect(run(toggleCentered, 'THE |END')).toBe('> THE |END <')
    expect(run(toggleCentered, '[THE\n\nEND]')).toBe('> THE <\n\n> END <')
  })

  it('turns a transition into centered text', () => {
    expect(run(toggleCentered, '> BURN| TO WHITE.')).toBe('> BURN| TO WHITE. <')
  })

  it('removes the centering when all selected lines have it', () => {
    expect(run(toggleCentered, '>THE |END<')).toBe('THE |END')
    expect(run(toggleCentered, '[> THE <\n\n> END <]')).toBe('THE\n\nEND')
  })

  it('leaves the cursor between the markers on a blank line', () => {
    expect(run(toggleCentered, 'Action.\n\n|')).toBe('Action.\n\n> | <')
  })
})

describe('isCentered', () => {
  it('tells whether all selected lines are centered', () => {
    expect(isCentered(viewOf('> THE |END <').state)).toBe(true)
    expect(isCentered(viewOf('[> THE <\n\nEND]').state)).toBe(false)
  })
})

describe('insertPageBreak', () => {
  it('adds a break after the line, with blank lines around it', () => {
    expect(run(insertPageBreak, 'Act|ion.')).toBe('Action.\n\n===\n\n|')
    expect(run(insertPageBreak, '|')).toBe('===\n\n|')
  })

  it('reuses the blank lines already there', () => {
    expect(run(insertPageBreak, 'One.\n\n|\n\nTwo.')).toBe('One.\n\n===\n\n|\n\nTwo.')
    expect(run(insertPageBreak, 'One.|\n\nTwo.')).toBe('One.\n\n===\n\n|\n\nTwo.')
    expect(run(insertPageBreak, 'One.|\n\n\n\n')).toBe('One.\n\n===\n\n|')
  })
})
