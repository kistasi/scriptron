import React, { useEffect, useRef, useState } from 'react'
import { filterScenes, type Scene } from './lib/outline'

interface SidebarProps {
  scenes: Scene[]
  // The scene the cursor is in, highlighted and kept in view.
  current: Scene | undefined
  onSelect: (scene: Scene) => void
  onCollapse: () => void
}

// The scene outline, as in Beat: every scene heading, numbered, filtered by the search field.
export function Sidebar({
  scenes,
  current,
  onSelect,
  onCollapse
}: SidebarProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const shown = filterScenes(scenes, query)

  useEffect(() => {
    listRef.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' })
  }, [current?.line])

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && shown.length > 0) {
      onSelect(shown[0])
    } else if (event.key === 'Escape') {
      setQuery('')
    }
  }

  return (
    <aside className="sidebar" aria-label="Scenes">
      {shown.length === 0 ? (
        <p className="sidebar-empty">{scenes.length === 0 ? 'No scenes' : 'No matching scenes'}</p>
      ) : (
        <ol className="sidebar-scenes" ref={listRef}>
          {shown.map((scene) => (
            <li key={scene.line}>
              <button
                type="button"
                className="sidebar-scene"
                aria-current={scene === current ? 'true' : undefined}
                onClick={() => onSelect(scene)}
              >
                <span className="sidebar-scene-number">{scene.number}.</span> {scene.heading}
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="sidebar-footer">
        <input
          type="search"
          className="sidebar-search"
          placeholder="Scene Heading"
          aria-label="Search scenes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKey}
        />
        <button
          type="button"
          className="sidebar-toggle"
          title="Hide Sidebar"
          aria-label="Hide Sidebar"
          onClick={onCollapse}
        >
          ‹
        </button>
      </div>
    </aside>
  )
}
