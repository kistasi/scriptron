import React, { useEffect, useMemo, useState } from 'react'
import fountain, { type FountainJson, type SceneElement } from './lib/fountain'

interface OpenedFile {
  path: string
  name: string
  content: string
}

// Parser output is HTML-escaped with only inline markup added, so it is safe to inject.
function Markup({
  as: Tag = 'span',
  html,
  ...rest
}: {
  as?: React.ElementType
  html: string
} & React.HTMLAttributes<HTMLElement>): React.JSX.Element {
  return <Tag {...rest} dangerouslySetInnerHTML={{ __html: html }} />
}

function TitlePage({ titlePage }: { titlePage: FountainJson['title_page'] }): React.JSX.Element {
  const { title, ...rest } = titlePage
  return (
    <header style={{ textAlign: 'center', marginBottom: 48 }}>
      {title?.map((t, i) => (
        <Markup key={i} as="h1" html={t} />
      ))}
      {Object.entries(rest).flatMap(([key, values]) =>
        (values ?? []).map((v, i) => <Markup key={`${key}-${i}`} as="p" html={v} />)
      )}
    </header>
  )
}

function Element({ element }: { element: SceneElement }): React.JSX.Element | null {
  switch (element.type) {
    case 'heading':
      return <Markup as="h3" html={element.heading} />
    case 'transition':
      return <Markup as="p" style={{ textAlign: 'right' }} html={element.text} />
    case 'section':
      return <Markup as="h2" html={element.name} />
    case 'synopsis':
      return <Markup as="p" style={{ fontStyle: 'italic' }} html={element.text} />
    case 'action':
      return <Markup as="p" html={element.text} />
    case 'dialogue-single':
    case 'dialogue-dual':
      return (
        <div style={{ display: 'flex', gap: 24 }}>
          {element.characters.map((c, i) => (
            <div key={i} style={{ flex: 1, margin: '0 auto', maxWidth: '60%' }}>
              <Markup as="p" style={{ textAlign: 'center' }} html={c.name} />
              {c.lines.map((line, j) => (
                <Markup
                  key={j}
                  as="p"
                  style={line.type === 'parenthetical' ? { paddingLeft: '15%' } : undefined}
                  html={line.text}
                />
              ))}
            </div>
          ))}
        </div>
      )
    default:
      return null
  }
}

function App(): React.JSX.Element {
  const [file, setFile] = useState<OpenedFile | null>(null)

  useEffect(() => window.api.onFileOpened(setFile), [])

  const script = useMemo(() => (file ? fountain.parseToJson(file.content) : null), [file])

  useEffect(() => {
    document.title = file ? `${file.name} — scriptron` : 'scriptron'
  }, [file])

  if (!file || !script) return <>scriptron</>

  return (
    <article style={{ fontFamily: 'Courier Prime, Courier, monospace', padding: 32 }}>
      <TitlePage titlePage={script.title_page} />
      {script.script.scenes?.map((scene, i) => (
        <section key={i}>
          {scene.map((element, j) => (
            <Element key={j} element={element} />
          ))}
        </section>
      ))}
    </article>
  )
}

export default App
