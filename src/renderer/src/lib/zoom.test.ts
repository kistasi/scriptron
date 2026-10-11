// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { listenForPinch } from './zoom'

describe('listenForPinch', () => {
  const wheel = (deltaY: number, ctrlKey = true): WheelEvent =>
    new WheelEvent('wheel', { deltaY, ctrlKey, cancelable: true, clientX: 10, clientY: 20 })

  let element: HTMLElement
  let handlers: {
    size: () => number
    preview: Mock<(size: number, x: number, y: number) => void>
    commit: Mock<(size: number) => void>
  }

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame']
    })
    element = document.createElement('div')
    handlers = { size: () => 12, preview: vi.fn(), commit: vi.fn() }
    listenForPinch(element, handlers)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('follows the pinch smoothly, showing at most one size a frame', () => {
    element.dispatchEvent(wheel(-10))
    element.dispatchEvent(wheel(-10))
    expect(handlers.preview).not.toHaveBeenCalled()
    vi.advanceTimersToNextFrame()
    // 12 × e^0.2
    expect(handlers.preview).toHaveBeenCalledTimes(1)
    expect(handlers.preview).toHaveBeenLastCalledWith(14.7, 10, 20)
    element.dispatchEvent(wheel(20))
    vi.advanceTimersToNextFrame()
    expect(handlers.preview).toHaveBeenLastCalledWith(12, 10, 20)
  })

  it('commits the size once the gesture is over', () => {
    element.dispatchEvent(wheel(-10))
    vi.advanceTimersByTime(100)
    expect(handlers.commit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(handlers.commit).toHaveBeenCalledWith(13.3)
  })

  it('keeps the size within the sizes offered in Settings', () => {
    element.dispatchEvent(wheel(-1000))
    vi.advanceTimersByTime(300)
    expect(handlers.commit).toHaveBeenLastCalledWith(24)
    element.dispatchEvent(wheel(1000))
    vi.advanceTimersByTime(300)
    expect(handlers.commit).toHaveBeenLastCalledWith(9)
  })

  it('leaves ordinary scrolling alone', () => {
    const event = wheel(-500, false)
    element.dispatchEvent(event)
    vi.advanceTimersByTime(300)
    expect(handlers.preview).not.toHaveBeenCalled()
    expect(handlers.commit).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('keeps the browser from zooming the window', () => {
    const event = wheel(-1)
    element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
