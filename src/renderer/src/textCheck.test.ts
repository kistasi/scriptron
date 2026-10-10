// @vitest-environment jsdom
import { Compartment } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TextIssue, TextMenuAction } from '../../shared/ipc'
import {
  textCheck,
  type TextCheckConfig,
  type TextCheckService,
  textCheckSettings
} from './textCheck'

const allOn: TextCheckConfig = { spelling: true, grammar: true, dictionary: [] }

type Service = { [K in keyof TextCheckService]: ReturnType<typeof vi.fn> }

let view: EditorView
const settings = new Compartment()

function setup(
  doc: string,
  issues: (text: string) => TextIssue[],
  action: TextMenuAction = null
): Service {
  const service: Service = {
    check: vi.fn((texts: string[]) => Promise.resolve(texts.map(issues))),
    showMenu: vi.fn(() => Promise.resolve(action)),
    learn: vi.fn()
  }
  view = new EditorView({
    doc,
    selection: { anchor: 0 },
    extensions: [
      settings.of(textCheckSettings(allOn)),
      textCheck(service as unknown as TextCheckService)
    ]
  })
  return service
}

// The underlined text, as "kind:text".
const underlined = (): string[] =>
  [...view.dom.querySelectorAll('.cm-spelling-error, .cm-grammar-error')].map(
    (element) =>
      `${element.classList.contains('cm-spelling-error') ? 'spelling' : 'grammar'}:${element.textContent}`
  )

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1000)
}

const configure = (config: Partial<TextCheckConfig>): void =>
  view.dispatch({ effects: settings.reconfigure(textCheckSettings({ ...allOn, ...config })) })

const jaxxon = (text: string): TextIssue[] => {
  const from = text.indexOf('Jaxxon')
  return from === -1 ? [] : [{ kind: 'spelling', from, to: from + 6 }]
}

// jsdom doesn't lay out, so a right-click is located by mocking posAtCoords.
function rightClickAt(pos: number): void {
  vi.spyOn(view, 'posAtCoords').mockReturnValue(pos)
  view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
}

afterEach(() => {
  view?.destroy()
  vi.useRealTimers()
})

describe('textCheck', () => {
  it('underlines the issues found in prose, but not in cues or headings', async () => {
    vi.useFakeTimers()
    const service = setup('INT. HOUSE - DAY\n\nJaxxon go home.\n\nBOB\nI seen him.', (text) =>
      text === 'I seen him.'
        ? [{ kind: 'grammar', from: 2, to: 6, message: 'Consider ‘saw’', corrections: ['saw'] }]
        : jaxxon(text)
    )
    await settle()
    expect(service.check).toHaveBeenCalledWith(['Jaxxon go home.', 'I seen him.'], {
      spelling: true,
      grammar: true
    })
    expect(underlined()).toEqual(['spelling:Jaxxon', 'grammar:seen'])
    expect(view.dom.querySelector('.cm-grammar-error')!.getAttribute('title')).toBe(
      'Consider ‘saw’'
    )
  })

  it('checks a line again only when its text changes', async () => {
    vi.useFakeTimers()
    const service = setup('Jaxxon runs.\n\nJaxxon runs.', jaxxon)
    await settle()
    expect(service.check).toHaveBeenCalledTimes(1)
    view.dispatch({ changes: { from: view.state.doc.length, insert: ' Fast.' } })
    await settle()
    expect(service.check).toHaveBeenLastCalledWith(['Jaxxon runs. Fast.'], expect.anything())
  })

  it('accepts dictionary words and characters’ names', async () => {
    vi.useFakeTimers()
    setup('Jaxxon runs.\n\nZORG\nHi.\n\nZorg runs.', (text) =>
      jaxxon(text).concat(text.startsWith('Zorg') ? [{ kind: 'spelling', from: 0, to: 4 }] : [])
    )
    await settle()
    expect(underlined()).toEqual(['spelling:Jaxxon'])
    configure({ dictionary: ['jaxxon'] })
    expect(underlined()).toEqual([])
  })

  it('stops underlining when turned off, and checks again when turned on', async () => {
    vi.useFakeTimers()
    const service = setup('Jaxxon runs.', jaxxon)
    await settle()
    configure({ spelling: false, grammar: false })
    expect(underlined()).toEqual([])

    configure({ grammar: false })
    await settle()
    expect(service.check).toHaveBeenLastCalledWith(['Jaxxon runs.'], {
      spelling: true,
      grammar: false
    })
    expect(underlined()).toEqual(['spelling:Jaxxon'])
  })

  it('replaces the word with the suggestion chosen from the context menu', async () => {
    vi.useFakeTimers()
    const service = setup('Jaxxon runs.', jaxxon, { type: 'replace', text: 'Jackson' })
    await settle()
    rightClickAt(2)
    await settle()
    expect(service.showMenu).toHaveBeenCalledWith({
      kind: 'spelling',
      text: 'Jaxxon',
      message: undefined,
      corrections: undefined
    })
    expect(view.state.doc.toString()).toBe('Jackson runs.')
  })

  it('learns or ignores a word from the context menu', async () => {
    vi.useFakeTimers()
    const learning = setup('Jaxxon runs.', jaxxon, { type: 'learn' })
    await settle()
    rightClickAt(2)
    await settle()
    expect(learning.learn).toHaveBeenCalledWith('Jaxxon')
    view.destroy()

    setup('Jaxxon runs. Jaxxon stops.', jaxxon, { type: 'ignore' })
    await settle()
    rightClickAt(2)
    await settle()
    expect(underlined()).toEqual([])
  })

  it('shows the plain context menu away from issues', async () => {
    vi.useFakeTimers()
    const service = setup('Jaxxon runs.', jaxxon)
    await settle()
    rightClickAt(9)
    await settle()
    expect(service.showMenu).toHaveBeenCalledWith(null)
  })
})
