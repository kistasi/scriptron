import { maxEditorFontSize, minEditorFontSize, roundFontSize } from '../../../shared/ipc'

// How quickly the size follows the pinch: the size is multiplied by e for every this many wheel
// delta pixels, as in Chromium's own pinch zoom.
const pinchRate = 100

// How long after the last pinch event the gesture counts as finished; macOS sends no end event.
const gestureEnd = 200

interface PinchHandlers {
  // The size in points when a gesture starts.
  size: () => number
  // Shows a size while pinching, at most once a frame; x and y are the pointer's client coordinates.
  preview: (size: number, x: number, y: number) => void
  // Called with the final size once the gesture is over.
  commit: (size: number) => void
}

// Turns pinch gestures (wheel events with ctrlKey set, as Chromium sends them on trackpads) into a
// text size that follows the fingers. Returns a cleanup function.
export function listenForPinch(element: HTMLElement, handlers: PinchHandlers): () => void {
  // While pinching: the exact size, which is rounded for showing, so the shown size is the one
  // that's saved.
  let size: number | null = null
  let shown: number | null = null
  let pointer = { x: 0, y: 0 }
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const show = (): void => {
    frame = 0
    if (size === null || roundFontSize(size) === shown) return
    shown = roundFontSize(size)
    handlers.preview(shown, pointer.x, pointer.y)
  }

  const finish = (): void => {
    if (frame) cancelAnimationFrame(frame)
    show()
    if (size !== null) handlers.commit(roundFontSize(size))
    size = shown = null
  }

  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey) return
    // Otherwise the browser would zoom the whole window.
    event.preventDefault()
    if (size === null) shown = size = handlers.size()
    size = Math.min(
      maxEditorFontSize,
      Math.max(minEditorFontSize, size * Math.exp(-event.deltaY / pinchRate))
    )
    pointer = { x: event.clientX, y: event.clientY }
    if (!frame) frame = requestAnimationFrame(show)
    clearTimeout(timer)
    timer = setTimeout(finish, gestureEnd)
  }

  element.addEventListener('wheel', onWheel, { passive: false })
  return () => {
    element.removeEventListener('wheel', onWheel)
    clearTimeout(timer)
    if (frame) cancelAnimationFrame(frame)
  }
}
