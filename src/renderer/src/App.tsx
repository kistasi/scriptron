import React, { useEffect, useRef, useState } from 'react'
import { Editor } from './Editor'

interface Document {
  // Changes whenever a different document is loaded, to remount the editor.
  id: number
  // null until the document has been saved somewhere.
  path: string | null
  name: string
  initialText: string
}

let nextDocumentId = 0

function createDocument(path: string | null, name: string, text: string): Document {
  return { id: nextDocumentId++, path, name, initialText: text }
}

function App(): React.JSX.Element {
  const [doc, setDoc] = useState(() => createDocument(null, 'Untitled', ''))
  const [text, setText] = useState('')
  const [savedText, setSavedText] = useState('')
  const dirty = text !== savedText

  // Menu commands arrive outside React's render cycle and need the latest values.
  const latest = useRef({ doc, text })
  useEffect(() => {
    latest.current = { doc, text }
  }, [doc, text])

  useEffect(() => {
    const load = (newDoc: Document): void => {
      setDoc(newDoc)
      setText(newDoc.initialText)
      setSavedText(newDoc.initialText)
    }

    const save = async (saveAs: boolean): Promise<void> => {
      const { doc, text } = latest.current
      const saved = await window.api.saveFile(text, saveAs ? null : doc.path)
      if (!saved) return
      // Ignore the result if another document was loaded while the save dialog was open.
      setDoc((current) => (current.id === doc.id ? { ...current, ...saved } : current))
      if (latest.current.doc.id === doc.id) setSavedText(text)
    }

    const unsubscribeOpened = window.api.onFileOpened((file) =>
      load(createDocument(file.path, file.name, file.content))
    )
    const unsubscribeMenu = window.api.onMenuCommand((command) => {
      if (command === 'new') load(createDocument(null, 'Untitled', ''))
      else save(command === 'save-as')
    })

    return () => {
      unsubscribeOpened()
      unsubscribeMenu()
    }
  }, [])

  useEffect(() => {
    window.api.setDirty(dirty)
    document.title = `${dirty ? '• ' : ''}${doc.name} — scriptron`
  }, [dirty, doc.name])

  return <Editor key={doc.id} initialText={doc.initialText} onChange={setText} />
}

export default App
