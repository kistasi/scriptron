import React, { useRef } from 'react'

export interface TabInfo {
  id: number
  // Shown on the tab.
  label: string
  // Shown when hovering over the tab, e.g. the file's path.
  title: string
  dirty: boolean
}

interface TabBarProps {
  tabs: TabInfo[]
  // null while the welcome screen is shown.
  activeId: number | null
  // Shows the welcome screen.
  onHome: () => void
  onSelect: (id: number) => void
  onClose: (id: number) => void
  onNew: () => void
  // Moves the tab to index, while it is dragged.
  onMove: (id: number, index: number) => void
}

// One tab per open document, above the sidebar and the editor.
export function TabBar({
  tabs,
  activeId,
  onHome,
  onSelect,
  onClose,
  onNew,
  onMove
}: TabBarProps): React.JSX.Element {
  // The tab being dragged.
  const dragged = useRef<number | null>(null)

  // Moves the dragged tab into the place of the one under the pointer once the pointer crosses
  // that tab's middle, so that tabs of different widths don't swap back and forth.
  const dragOver = (event: React.DragEvent<HTMLElement>, index: number): void => {
    const id = dragged.current
    if (id === null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const from = tabs.findIndex((tab) => tab.id === id)
    if (from === index) return
    const { left, width } = event.currentTarget.getBoundingClientRect()
    const pastMiddle = event.clientX > left + width / 2
    if (index > from ? pastMiddle : !pastMiddle) onMove(id, index)
  }

  return (
    <div className="tab-bar">
      {/* Stays at the start, outside the scrolling tabs. */}
      <button
        type="button"
        className={`tab-home${activeId === null ? ' tab-active' : ''}`}
        title="Home"
        aria-label="Home"
        aria-pressed={activeId === null}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onHome}
      >
        <svg viewBox="0 0 16 16" width="1.15em" height="1.15em" aria-hidden>
          <path
            d="M2.5 7.5 8 3l5.5 4.5M4 6.5V13h3V9.5h2V13h3V6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="tabs" role="tablist" aria-label="Documents">
        {tabs.map(({ id, label, title, dirty }, index) => (
          <div
            key={id}
            className={`tab${id === activeId ? ' tab-active' : ''}${dirty ? ' tab-dirty' : ''}`}
            title={title}
            draggable
            onDragStart={(event) => {
              dragged.current = id
              event.dataTransfer.effectAllowed = 'move'
              onSelect(id)
            }}
            onDragOver={(event) => dragOver(event, index)}
            onDrop={(event) => event.preventDefault()}
            onDragEnd={() => (dragged.current = null)}
            // Middle-click closes, as in browsers.
            onAuxClick={(event) => event.button === 1 && onClose(id)}
          >
            <button
              type="button"
              role="tab"
              className="tab-label"
              aria-selected={id === activeId}
              onClick={() => onSelect(id)}
            >
              {label}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${label}`}
              // Keeps the focus in the editor.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onClose(id)}
            >
              {/* An unsaved tab shows a dot, which turns into the close button on hover. */}
              <span className="tab-close-icon" aria-hidden>
                ×
              </span>
              <span className="tab-dirty-icon" aria-hidden>
                ●
              </span>
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="tab-new"
        title="New Document"
        aria-label="New Document"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onNew}
      >
        +
      </button>
    </div>
  )
}
