import React, { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { openSearchPanel } from '@codemirror/search'
import { Compartment, type EditorState } from '@codemirror/state'
import { EditorView, minimalSetup } from 'codemirror'
import { autoformat } from './autoformat'
import { characterCompletion } from './characterCompletion'
import { activeEmphasis, emphasisKeys, toggleEmphasis } from './emphasis'
import { fountainFormatting } from './fountainFormatting'
import { insertPageBreak, isCentered, toggleCentered } from './lineFormats'
import { screenplayKeys } from './screenplayKeys'
import { screenplaySearch } from './search'
import { Toolbar, type ToolbarCommand } from './Toolbar'

export interface EditorHandle {
  // Puts the cursor at the start of a source line (0-based) and scrolls it to the top.
  goToLine: (line: number) => void
  // Opens the find & replace panel, or focuses it if it's already open.
  openSearch: () => void
}

interface EditorProps {
  initialText: string
  // Text size in points.
  fontSize: number
  onChange: (text: string) => void
  // Called with the cursor's source line (0-based) whenever it may have moved.
  onCursorLine?: (line: number) => void
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
  fontSize,
  onChange,
  onCursorLine,
  ref
}: EditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const formatting = useRef(new Compartment())
  // Read when the editor mounts; later changes reconfigure it below.
  const initialFontSize = useRef(fontSize)
  const callbacks = useRef({ onChange, onCursorLine })
  const [active, setActive] = useState<Set<ToolbarCommand>>(() => new Set())

  useEffect(() => {
    callbacks.current = { onChange, onCursorLine }
  }, [onChange, onCursorLine])

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
      extensions: [
        minimalSetup,
        EditorView.lineWrapping,
        formatting.current.of(fountainFormatting(initialFontSize.current)),
        characterCompletion(),
        screenplayKeys(),
        emphasisKeys(),
        screenplaySearch(),
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
    view.focus()
    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [initialText])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: formatting.current.reconfigure(fountainFormatting(fontSize))
    })
  }, [fontSize])

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
    <div className="editor-pane">
      <Toolbar active={active} onCommand={runCommand} />
      <div ref={hostRef} className="editor" />
    </div>
  )
}
