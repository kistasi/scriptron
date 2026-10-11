import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { classifiedDoc } from './classifiedDoc'

describe('classifiedDoc', () => {
  it('classifies the lines of a document', () => {
    const doc = Text.of(['INT. HOUSE - DAY', '', 'BOB', 'Hi.'])
    expect(classifiedDoc(doc)).toEqual({
      lines: ['INT. HOUSE - DAY', '', 'BOB', 'Hi.'],
      types: ['scene-heading', 'empty', 'character', 'dialogue']
    })
  })

  it('classifies each document once', () => {
    const doc = Text.of(['BOB', 'Hi.'])
    expect(classifiedDoc(doc)).toBe(classifiedDoc(doc))
  })

  it('classifies a changed document afresh', () => {
    const doc = Text.of(['Bob', 'Hi.'])
    const changed = doc.replace(0, 3, Text.of(['BOB']))
    expect(classifiedDoc(doc).types).toEqual(['action', 'action'])
    expect(classifiedDoc(changed).types).toEqual(['character', 'dialogue'])
  })
})
