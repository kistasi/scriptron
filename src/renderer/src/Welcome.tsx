import React from 'react'
import type { RecentDocument } from '../../shared/ipc'

interface WelcomeProps {
  // The most recent first.
  recent: RecentDocument[]
  // The titles of the bundled sample screenplays.
  samples: string[]
  onNew: () => void
  onOpen: () => void
  onOpenRecent: (path: string) => void
  onOpenSample: (title: string) => void
}

// "Big Fish.fountain" → "Big Fish"
const baseName = (name: string): string => name.replace(/\.fountain$/i, '')

// The home page: shown from the home button, when the app opens with no documents to reopen, and
// once the last tab is closed.
export function Welcome({
  recent,
  samples,
  onNew,
  onOpen,
  onOpenRecent,
  onOpenSample
}: WelcomeProps): React.JSX.Element {
  return (
    <main className="welcome">
      <h1 className="welcome-title">Scriptron</h1>
      <div className="welcome-actions">
        <button type="button" className="welcome-action" onClick={onNew}>
          New Script
        </button>
        <button type="button" className="welcome-action" onClick={onOpen}>
          Open…
        </button>
      </div>
      <section className="welcome-recent" aria-labelledby="welcome-recent-heading">
        <h2 id="welcome-recent-heading" className="welcome-heading">
          Recent
        </h2>
        {recent.length === 0 ? (
          <p className="welcome-empty">Scripts you open will be listed here.</p>
        ) : (
          <ul className="welcome-list">
            {recent.map(({ path, name, folder }) => (
              <li key={path}>
                <button
                  type="button"
                  className="welcome-document"
                  title={path}
                  onClick={() => onOpenRecent(path)}
                >
                  <span className="welcome-document-name">{baseName(name)}</span>
                  <span className="welcome-document-folder">{folder}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {samples.length > 0 && (
        <section className="welcome-samples" aria-labelledby="welcome-samples-heading">
          <h2 id="welcome-samples-heading" className="welcome-heading">
            Samples
          </h2>
          <ul className="welcome-list">
            {samples.map((title) => (
              <li key={title}>
                <button
                  type="button"
                  className="welcome-document"
                  onClick={() => onOpenSample(title)}
                >
                  <span className="welcome-document-name">{title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
