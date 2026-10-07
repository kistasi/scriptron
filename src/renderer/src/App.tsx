import React, { useEffect, useState } from 'react'

interface OpenedFile {
  path: string
  name: string
  content: string
}

function App(): React.JSX.Element {
  const [file, setFile] = useState<OpenedFile | null>(null)

  useEffect(() => window.api.onFileOpened(setFile), [])

  useEffect(() => {
    document.title = file ? `${file.name} — scriptron` : 'scriptron'
  }, [file])

  if (!file) return <>scriptron</>

  return <pre style={{ whiteSpace: 'pre-wrap', padding: 16 }}>{file.content}</pre>
}

export default App
