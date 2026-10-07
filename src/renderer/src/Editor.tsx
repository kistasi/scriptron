import React, { useEffect, useRef } from 'react'
import { EditorView, minimalSetup } from 'codemirror'
import { fountainFormatting } from './fountainFormatting'

interface EditorProps {
  initialText: string
  onChange: (text: string) => void
}

// Uncontrolled: the text is only read from initialText when the editor mounts,
// so give it a new key to load a different document.
export function Editor({ initialText, onChange }: EditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      doc: initialText,
      extensions: [
        minimalSetup,
        EditorView.lineWrapping,
        fountainFormatting(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        })
      ]
    })
    view.focus()
    return () => view.destroy()
  }, [initialText])

  return <div ref={hostRef} className="editor" />
}
