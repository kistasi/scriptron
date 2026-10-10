import { type Extension, Facet, type Range, StateEffect, type Text } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import type { TextCheckOptions, TextIssue, TextMenuAction, TextMenuIssue } from '../../shared/ipc'
import { characterNames } from './lib/characterNames'
import { classifyLines, type LineType } from './lib/fountainLines'
import { acceptedWords, checkableText, ignoreKey, shownIssues } from './lib/textCheck'

export interface TextCheckConfig extends TextCheckOptions {
  // The user's own words, accepted on top of the system dictionary.
  dictionary: readonly string[]
}

// How the editor reaches the operating system's checker, and the user's dictionary.
export interface TextCheckService {
  check: (texts: string[], options: TextCheckOptions) => Promise<TextIssue[][]>
  showMenu: (issue: TextMenuIssue | null) => Promise<TextMenuAction>
  learn: (word: string) => void
}

const off: TextCheckConfig = { spelling: false, grammar: false, dictionary: [] }

const textCheckConfig = Facet.define<TextCheckConfig, TextCheckConfig>({
  combine: (values) => values[0] ?? off
})

// Redraws the underlines, e.g. once results arrive.
const refresh = StateEffect.define<null>()

// Waits for a pause in typing or scrolling before asking the checker.
const checkDelay = 400
// Results are kept per line text; past this many they are dropped and rechecked as needed.
const maxCached = 20000

const marks = {
  spelling: Decoration.mark({ class: 'cm-spelling-error' }),
  grammar: new Map<string, Decoration>()
}

function grammarMark(message = ''): Decoration {
  let mark = marks.grammar.get(message)
  if (!mark) {
    mark = Decoration.mark({ class: 'cm-grammar-error', attributes: { title: message } })
    marks.grammar.set(message, mark)
  }
  return mark
}

class TextChecker {
  decorations: DecorationSet = Decoration.none
  // Issues by checkable line text, for the current options.
  private cache = new Map<string, TextIssue[]>()
  private pending = new Set<string>()
  private ignored = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private destroyed = false
  // The classification of the document last seen, and the words accepted in it.
  private doc: Text | null = null
  private types: LineType[] = []
  private accepted = new Set<string>()
  private dictionary: readonly string[] = []

  constructor(
    private view: EditorView,
    private service: TextCheckService
  ) {
    this.decorations = this.build()
    this.schedule()
  }

  update(update: ViewUpdate): void {
    const before = update.startState.facet(textCheckConfig)
    const config = update.state.facet(textCheckConfig)
    if (before.spelling !== config.spelling || before.grammar !== config.grammar) {
      this.cache.clear()
      this.pending.clear()
    }
    const refreshed = update.transactions.some((tr) => tr.effects.some((e) => e.is(refresh)))
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.selectionSet ||
      before !== config ||
      refreshed
    ) {
      this.decorations = this.build()
    }
    if (update.docChanged || update.viewportChanged || before !== config) this.schedule()
  }

  destroy(): void {
    this.destroyed = true
    clearTimeout(this.timer)
  }

  private get config(): TextCheckConfig {
    return this.view.state.facet(textCheckConfig)
  }

  private get enabled(): boolean {
    return this.config.spelling || this.config.grammar
  }

  private classify(): void {
    const { doc } = this.view.state
    const { dictionary } = this.config
    if (doc === this.doc && dictionary === this.dictionary) return
    const lines = doc.toJSON()
    if (doc !== this.doc) this.types = classifyLines(lines)
    this.accepted = acceptedWords(dictionary, characterNames(lines, this.types))
    this.doc = doc
    this.dictionary = dictionary
  }

  // The checkable lines in the viewport, with their checked text.
  private *visibleLines(): Generator<{ from: number; text: string }> {
    const { doc } = this.view.state
    const { from, to } = this.view.viewport
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
      const line = doc.line(n)
      const text = checkableText(line.text, this.types[n - 1])
      if (text !== null) yield { from: line.from, text }
    }
  }

  private issuesIn(text: string): TextIssue[] {
    return shownIssues(this.cache.get(text) ?? [], text, this.accepted, this.ignored)
  }

  private build(): DecorationSet {
    if (!this.enabled) return Decoration.none
    this.classify()
    const { selection } = this.view.state
    const cursor = selection.main.empty ? selection.main.head : -1
    const ranges: Range<Decoration>[] = []
    for (const { from, text } of this.visibleLines()) {
      for (const issue of this.issuesIn(text)) {
        const start = from + issue.from
        const end = from + issue.to
        // Not the word being typed.
        if (issue.kind === 'spelling' && cursor > start && cursor <= end) continue
        const mark = issue.kind === 'spelling' ? marks.spelling : grammarMark(issue.message)
        ranges.push(mark.range(start, end))
      }
    }
    return Decoration.set(ranges, true)
  }

  private schedule(): void {
    clearTimeout(this.timer)
    if (this.enabled) this.timer = setTimeout(() => this.checkVisible(), checkDelay)
  }

  private async checkVisible(): Promise<void> {
    this.classify()
    const texts = new Set<string>()
    for (const { text } of this.visibleLines()) {
      if (!this.cache.has(text) && !this.pending.has(text)) texts.add(text)
    }
    if (texts.size === 0) return

    const { spelling, grammar } = this.config
    const batch = [...texts]
    for (const text of batch) this.pending.add(text)
    let results: TextIssue[][]
    try {
      results = await this.service.check(batch, { spelling, grammar })
    } catch (error) {
      console.error('Could not check spelling and grammar', error)
      return
    } finally {
      for (const text of batch) this.pending.delete(text)
    }

    const config = this.config
    if (this.destroyed || config.spelling !== spelling || config.grammar !== grammar) return
    if (this.cache.size + batch.length > maxCached) this.cache.clear()
    batch.forEach((text, i) => this.cache.set(text, results[i] ?? []))
    this.view.dispatch({ effects: refresh.of(null) })
  }

  // The issue at a document position, with the line it is on.
  private issueAt(pos: number): { lineFrom: number; text: string; issue: TextIssue } | null {
    if (!this.enabled) return null
    this.classify()
    const line = this.view.state.doc.lineAt(pos)
    const text = checkableText(line.text, this.types[line.number - 1])
    if (text === null) return null
    const offset = pos - line.from
    const issue = this.issuesIn(text).find(({ from, to }) => from <= offset && offset <= to)
    return issue ? { lineFrom: line.from, text, issue } : null
  }

  async contextMenu(event: MouseEvent): Promise<void> {
    const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY })
    const found = pos === null ? null : this.issueAt(pos)
    const word = found ? found.text.slice(found.issue.from, found.issue.to) : ''
    const action = await this.service.showMenu(
      found && {
        kind: found.issue.kind,
        text: word,
        message: found.issue.message,
        corrections: found.issue.corrections
      }
    )
    if (!found || !action || this.destroyed) return

    if (action.type === 'learn') {
      this.service.learn(word)
    } else if (action.type === 'ignore') {
      this.ignored.add(ignoreKey(found.issue, found.text))
      this.view.dispatch({ effects: refresh.of(null) })
    } else {
      const from = found.lineFrom + found.issue.from
      const to = found.lineFrom + found.issue.to
      // The text may have changed while the menu was open.
      if (this.view.state.sliceDoc(from, to) !== word) return
      this.view.dispatch({
        changes: { from, to, insert: action.text },
        selection: { anchor: from + action.text.length },
        userEvent: 'input.complete'
      })
      this.view.focus()
    }
  }
}

const theme = EditorView.theme({
  '.cm-spelling-error, .cm-grammar-error': {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationThickness: '2px',
    textUnderlineOffset: '3px',
    textDecorationSkipInk: 'none'
  },
  '.cm-spelling-error': { textDecorationColor: 'var(--spelling-error)' },
  '.cm-grammar-error': { textDecorationColor: 'var(--grammar-error)' }
})

// Underlines misspellings and grammar issues found by the operating system's checker, in the
// visible part of the screenplay, with suggestions in the context menu.
export function textCheck(service: TextCheckService): Extension {
  const plugin = ViewPlugin.define((view) => new TextChecker(view, service), {
    decorations: (checker) => checker.decorations,
    eventHandlers: {
      contextmenu(event) {
        event.preventDefault()
        this.contextMenu(event)
        return true
      }
    }
  })
  return [plugin, theme]
}

// What to check; reconfigure (in a Compartment) to change it.
export const textCheckSettings = (config: TextCheckConfig): Extension => textCheckConfig.of(config)
