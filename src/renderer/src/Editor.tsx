import React, { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { openSearchPanel } from '@codemirror/search'
import { Compartment, type EditorState } from '@codemirror/state'
import { EditorView, minimalSetup } from 'codemirror'
import { autoformat } from './autoformat'
import { screenplayCompletion } from './completion'
import { activeEmphasis, emphasisKeys, toggleEmphasis } from './emphasis'
import { baseFontSize, fountainFormatting } from './fountainFormatting'
import { listenForPinch } from './lib/zoom'
import { insertPageBreak, isCentered, toggleCentered } from './lineFormats'
import { screenplayKeys } from './screenplayKeys'
import { screenplaySearch } from './search'
import { spellcheck } from './spellcheck'
import { Toolbar, type ToolbarCommand } from './Toolbar'

export interface EditorHandle {
  // Puts the cursor at the start of a source line (0-based) and scrolls it to the top.
  goToLine: (line: number) => void
  // Opens the find & replace panel, or focuses it if it's already open.
  openSearch: () => void
}

interface EditorProps {
  initialText: string
  // Where the cursor starts, as an offset into initialText.
  initialCursor?: number
  // Text size in points.
  fontSize: number
  // Whether misspellings are underlined.
  checkSpelling: boolean
  // Whether this is the shown tab; the others stay mounted but hidden, keeping their history.
  visible: boolean
  onChange: (text: string) => void
  // Called with the cursor's source line (0-based) whenever it may have moved.
  onCursorLine?: (line: number) => void
  // Called with the new text size when a pinch is over.
  onZoom?: (fontSize: number) => void
  ref?: React.Ref<EditorHandle>
}

// The formats at the selection, shown as pressed toolbar buttons.
function activeFormats(state: EditorState): Set<ToolbarCommand> {
  const active = new Set<ToolbarCommand>(activeEmphasis(state))
  if (isCentered(state)) active.add('centered')
  return active
}

// Uncontrolled: the text is only read from initialText when the editor mounts,
// so give it a new key to load a different document.
export function Editor({
  initialText,
  initialCursor = 0,
  fontSize,
  checkSpelling,
  visible,
  onChange,
  onCursorLine,
  onZoom,
  ref
}: EditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const formatting = useRef(new Compartment())
  const checking = useRef(new Compartment())
  // Read when the editor mounts; later changes reconfigure it below.
  const initialFontSize = useRef(fontSize)
  const initialCheckSpelling = useRef(checkSpelling)
  const initialCursorRef = useRef(initialCursor)
  const paneRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onChange, onCursorLine, onZoom })
  const [active, setActive] = useState<Set<ToolbarCommand>>(() => new Set())

  useEffect(() => {
    callbacks.current = { onChange, onCursorLine, onZoom }
  }, [onChange, onCursorLine, onZoom])

  // The size shown, which runs ahead of fontSize while pinching.
  const shownFontSize = useRef(fontSize)

  useEffect(
    () =>
      listenForPinch(paneRef.current!, {
        size: () => shownFontSize.current,
        preview: (size, x, y) => {
          const view = viewRef.current
          if (!view) return
          // The text under the pointer stays there: its offset from the pointer scales too.
          const ratio = size / shownFontSize.current
          const position = view.posAtCoords({ x, y }, false)
          const before = view.coordsAtPos(position)
          shownFontSize.current = size
          hostRef.current!.style.setProperty('--scale', String(size / baseFontSize))
          if (!before) {
            view.requestMeasure()
            return
          }
          const scroller = view.scrollDOM.getBoundingClientRect()
          view.dispatch({
            effects: EditorView.scrollIntoView(position, {
              x: 'start',
              y: 'start',
              xMargin: x - scroller.left - (x - before.left) * ratio,
              yMargin: y - scroller.top - (y - before.top) * ratio
            })
          })
        },
        commit: (size) => callbacks.current.onZoom?.(size)
      }),
    []
  )

  useImperativeHandle(ref, () => ({
    goToLine: (line) => {
      const view = viewRef.current
      if (!view) return
      const position = view.state.doc.line(Math.min(line + 1, view.state.doc.lines)).from
      view.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: 48 })
      })
      view.focus()
    },
    openSearch: () => {
      if (viewRef.current) openSearchPanel(viewRef.current)
    }
  }))

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      doc: initialText,
      selection: { anchor: initialCursorRef.current },
      extensions: [
        minimalSetup,
        EditorView.lineWrapping,
        formatting.current.of(fountainFormatting(initialFontSize.current)),
        screenplayCompletion(),
        screenplayKeys(),
        emphasisKeys(),
        screenplaySearch(),
        checking.current.of(spellcheck(initialCheckSpelling.current)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
          if (update.docChanged || update.selectionSet) {
            const { doc, selection } = update.state
            callbacks.current.onCursorLine?.(doc.lineAt(selection.main.head).number - 1)
            setActive(activeFormats(update.state))
          }
        })
      ]
    })
    viewRef.current = view
    setActive(activeFormats(view.state))
    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [initialText])

  // Runs after the editor is created, so a new tab's editor is focused too.
  useEffect(() => {
    const view = viewRef.current
    if (!visible || !view) return
    // It couldn't measure its layout while hidden.
    view.requestMeasure()
    view.focus()
  }, [visible])

  useEffect(() => {
    shownFontSize.current = fontSize
    const view = viewRef.current
    if (!view) return
    // Keeps the text at the top of the view in place, rather than the scroll offset in pixels.
    view.dispatch({
      effects: [formatting.current.reconfigure(fountainFormatting(fontSize)), view.scrollSnapshot()]
    })
  }, [fontSize])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: checking.current.reconfigure(spellcheck(checkSpelling)) })
  }, [checkSpelling])

  const runCommand = (command: ToolbarCommand): void => {
    const view = viewRef.current
    if (!view) return
    if (command === 'centered') toggleCentered(view)
    else if (command === 'page-break') insertPageBreak(view)
    else if (command === 'autoformat') autoformat(view)
    else toggleEmphasis(command)(view)
    view.focus()
  }

  return (
    <div ref={paneRef} className="editor-pane" hidden={!visible}>
      <Toolbar active={active} onCommand={runCommand} />
      {/* Pinching sets --scale directly until the new size comes back as fontSize. */}
      <div
        ref={hostRef}
        className="editor"
        style={{ '--scale': fontSize / baseFontSize } as React.CSSProperties}
      />
    </div>
  )
}
