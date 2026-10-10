import React, { useEffect, useImperativeHandle, useRef } from 'react'
import { EditorView, minimalSetup } from 'codemirror'
import { fountainFormatting } from './fountainFormatting'

export interface EditorHandle {
  // Puts the cursor at the start of a source line (0-based) and scrolls it to the top.
  goToLine: (line: number) => void
}

interface EditorProps {
  initialText: string
  onChange: (text: string) => void
  // Called with the cursor's source line (0-based) whenever it may have moved.
  onCursorLine?: (line: number) => void
  ref?: React.Ref<EditorHandle>
}

// Uncontrolled: the text is only read from initialText when the editor mounts,
// so give it a new key to load a different document.
export function Editor({
  initialText,
  onChange,
  onCursorLine,
  ref
}: EditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const callbacks = useRef({ onChange, onCursorLine })

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
    }
  }))

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      doc: initialText,
      extensions: [
        minimalSetup,
        EditorView.lineWrapping,
        fountainFormatting(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
          if (update.docChanged || update.selectionSet) {
            const { doc, selection } = update.state
            callbacks.current.onCursorLine?.(doc.lineAt(selection.main.head).number - 1)
          }
        })
      ]
    })
    viewRef.current = view
    view.focus()
    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [initialText])

  return <div ref={hostRef} className="editor" />
}
