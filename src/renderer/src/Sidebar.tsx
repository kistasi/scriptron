import React, { useEffect, useRef, useState } from 'react'
import { filterScenes, type Scene } from './lib/outline'

interface SidebarProps {
  scenes: Scene[]
  // The scene the cursor is in, highlighted and kept in view.
  current: Scene | undefined
  onSelect: (scene: Scene) => void
  // Asks to move the scene at index `from` of scenes to index `to`, after it was dragged.
  onMove: (from: number, to: number) => void
  onCollapse: () => void
  // The width in pixels, or null for the default width.
  width: number | null
  onResize: (width: number | null) => void
}

const minWidth = 160
const keyStep = 16

// The widest the sidebar may be: most of the window, leaving room for the page.
const maxWidth = (): number => Math.max(minWidth, window.innerWidth * 0.6)

const clampWidth = (width: number): number =>
  Math.round(Math.min(maxWidth(), Math.max(minWidth, width)))

// Where a dragged scene would be dropped: next to the scene at index `target` of scenes.
interface Drop {
  target: number
  after: boolean
}

// The index the dragged scene ends up at, or null if it stays where it is.
function dropIndex(from: number, { target, after }: Drop): number | null {
  const to = target + (after ? 1 : 0) - (target > from ? 1 : 0)
  return to === from ? null : to
}

// The scene outline, as in Beat: every scene heading, numbered, filtered by the search field.
export function Sidebar({
  scenes,
  current,
  onSelect,
  onMove,
  onCollapse,
  width,
  onResize
}: SidebarProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const shown = filterScenes(scenes, query)
  // The index in scenes of the scene being dragged, and where it would be dropped.
  const dragged = useRef<number | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)

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

  // Dragging the right edge resizes; the pointer is captured so the drag survives leaving the handle.
  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !asideRef.current) return
    event.preventDefault()
    const handle = event.currentTarget
    const left = asideRef.current.getBoundingClientRect().left
    handle.setPointerCapture(event.pointerId)
    document.body.classList.add('resizing-sidebar')
    const move = (event: PointerEvent): void => onResize(clampWidth(event.clientX - left))
    const end = (): void => {
      document.body.classList.remove('resizing-sidebar')
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('lostpointercapture', end)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('lostpointercapture', end)
  }

  // The upper half of a scene drops before it, the lower half after it.
  const dropAt = (event: React.DragEvent<HTMLLIElement>, target: number): Drop => {
    const { top, height } = event.currentTarget.getBoundingClientRect()
    return { target, after: event.clientY > top + height / 2 }
  }

  const onDragOver = (event: React.DragEvent<HTMLLIElement>, target: number): void => {
    const from = dragged.current
    if (from === null) return
    event.preventDefault()
    const next = dropAt(event, target)
    if (dropIndex(from, next) === null) {
      event.dataTransfer.dropEffect = 'none'
      setDrop(null)
    } else {
      event.dataTransfer.dropEffect = 'move'
      if (drop?.target !== next.target || drop.after !== next.after) setDrop(next)
    }
  }

  const onDrop = (event: React.DragEvent<HTMLLIElement>, target: number): void => {
    event.preventDefault()
    const from = dragged.current
    const to = from === null ? null : dropIndex(from, dropAt(event, target))
    dragged.current = null
    setDrop(null)
    if (from !== null && to !== null) onMove(from, to)
  }

  const onDragEnd = (): void => {
    dragged.current = null
    setDrop(null)
  }

  const onResizeKey = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const current = asideRef.current?.getBoundingClientRect().width ?? 0
    if (event.key === 'ArrowLeft') onResize(clampWidth(current - keyStep))
    else if (event.key === 'ArrowRight') onResize(clampWidth(current + keyStep))
    else if (event.key === 'Enter') onResize(null)
    else return
    event.preventDefault()
  }

  return (
    <aside
      className="sidebar"
      aria-label="Scenes"
      ref={asideRef}
      style={width === null ? undefined : { flexBasis: Math.min(width, maxWidth()) }}
    >
      {shown.length === 0 ? (
        <p className="sidebar-empty">{scenes.length === 0 ? 'No scenes' : 'No matching scenes'}</p>
      ) : (
        <ol className="sidebar-scenes" ref={listRef}>
          {shown.map((scene) => {
            const index = scenes.indexOf(scene)
            const dropClass =
              drop?.target === index ? (drop.after ? ' drop-after' : ' drop-before') : ''
            return (
              <li
                key={scene.line}
                className={`sidebar-scene-item${dropClass}`}
                draggable
                onDragStart={(event) => {
                  dragged.current = index
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', scene.heading)
                }}
                onDragOver={(event) => onDragOver(event, index)}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                    setDrop(null)
                }}
                onDrop={(event) => onDrop(event, index)}
                onDragEnd={onDragEnd}
              >
                <button
                  type="button"
                  className="sidebar-scene"
                  aria-current={scene === current ? 'true' : undefined}
                  onClick={() => onSelect(scene)}
                >
                  <span className="sidebar-scene-number">{scene.number}.</span> {scene.heading}
                </button>
              </li>
            )
          })}
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
      <div
        className="sidebar-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Sidebar"
        title="Drag to resize, double-click to reset"
        tabIndex={0}
        onPointerDown={onResizeStart}
        onDoubleClick={() => onResize(null)}
        onKeyDown={onResizeKey}
      />
    </aside>
  )
}
