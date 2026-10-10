import React from 'react'

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
  activeId: number
  onSelect: (id: number) => void
  onClose: (id: number) => void
  onNew: () => void
}

// One tab per open document, above the sidebar and the editor.
export function TabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew
}: TabBarProps): React.JSX.Element {
  return (
    <div className="tab-bar">
      <div className="tabs" role="tablist" aria-label="Documents">
        {tabs.map(({ id, label, title, dirty }) => (
          <div
            key={id}
            className={`tab${id === activeId ? ' tab-active' : ''}${dirty ? ' tab-dirty' : ''}`}
            title={title}
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
