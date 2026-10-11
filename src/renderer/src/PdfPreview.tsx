import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { page } from './lib/screenplayLayout'
import type { PrintedScreenplay } from './lib/printLayout'
import { PageSheet, TitleSheet } from './PrintView'

// CSS pixels per inch, which is how the printed pages are sized on screen.
const pixelsPerInch = 96
const pageWidth = page.width * pixelsPerInch

// Width of the page thumbnails, in pixels.
const thumbnailWidth = 120
const thumbnailScale = thumbnailWidth / pageWidth

// Space around the pages in the main view, in pixels; they are shrunk to fit, but not enlarged.
const pagesGutter = 32
// Space between the pages, in pixels.
const pagesGap = 16
const pagesScale = (width: number): number => Math.min(1, (width - 2 * pagesGutter) / pageWidth)

interface PdfPreviewProps {
  screenplay: PrintedScreenplay
  onExport: () => void
  onClose: () => void
}

// The pages as they will be exported, over the whole window: thumbnails to jump to a page on the
// left, the pages themselves in the middle. They are the same elements the PDF is printed from.
export function PdfPreview({ screenplay, onExport, onClose }: PdfPreviewProps): React.JSX.Element {
  // The title page first, then the pages, numbered from the first after the title page.
  const sheets = useMemo(
    () => [
      ...(screenplay.titlePage
        ? [
            {
              label: 'Title page',
              number: null,
              sheet: <TitleSheet titlePage={screenplay.titlePage} />
            }
          ]
        : []),
      ...screenplay.pages.map((printed, k) => ({
        label: `Page ${k + 1}`,
        number: k + 1,
        sheet: <PageSheet printed={printed} />
      }))
    ],
    [screenplay]
  )
  const pagesRef = useRef<HTMLDivElement>(null)
  const thumbnailsRef = useRef<HTMLElement>(null)
  const [scale, setScale] = useState(1)
  // The page at the top of the view, highlighted among the thumbnails.
  const [current, setCurrent] = useState(0)

  // Shrinks the pages to the width of the view.
  useLayoutEffect(() => {
    const pages = pagesRef.current
    if (!pages) return
    const fit = (): void => setScale(pagesScale(pages.clientWidth) || 1)
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(pages)
    return () => observer.disconnect()
  }, [])

  // Takes the keyboard so that the pages scroll with it, and gives it back when closed.
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null
    pagesRef.current?.focus()
    return () => focused?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Keeps the current page's thumbnail in sight.
  useEffect(() => {
    const thumbnail = thumbnailsRef.current?.children[current] as HTMLElement | undefined
    thumbnail?.scrollIntoView?.({ block: 'nearest' })
  }, [current])

  // The current page is the last one whose top is above the upper third of the view.
  const onScroll = (): void => {
    const pages = pagesRef.current
    if (!pages) return
    const line = pages.scrollTop + pages.clientHeight / 3
    const tops = Array.from(pages.children, (child) => (child as HTMLElement).offsetTop)
    const index = tops.findLastIndex((top) => top <= line)
    setCurrent(Math.max(0, index))
  }

  const showPage = (index: number): void => {
    const pages = pagesRef.current
    const sheet = pages?.children[index] as HTMLElement | undefined
    if (!pages || !sheet) return
    pages.scrollTo?.({ top: sheet.offsetTop - pagesGap })
    setCurrent(index)
  }

  return (
    <div className="preview" role="dialog" aria-label="PDF Preview">
      <nav ref={thumbnailsRef} className="preview-thumbnails" aria-label="Pages">
        {sheets.map(({ label, number, sheet }, k) => (
          <button
            key={k}
            type="button"
            className="preview-thumbnail"
            aria-label={label}
            aria-current={k === current ? 'page' : undefined}
            onClick={() => showPage(k)}
          >
            <div className="preview-sheet" style={{ zoom: thumbnailScale }} aria-hidden>
              {sheet}
            </div>
            <span className="preview-thumbnail-label">{number}</span>
          </button>
        ))}
      </nav>
      <div
        ref={pagesRef}
        className="preview-pages"
        style={{ padding: pagesGutter, gap: pagesGap }}
        tabIndex={-1}
        onScroll={onScroll}
      >
        {sheets.map(({ label, sheet }, k) => (
          <div key={k} className="preview-sheet" style={{ zoom: scale }} aria-label={label}>
            {sheet}
          </div>
        ))}
      </div>
      <div className="preview-actions">
        <button type="button" className="preview-button" onClick={onExport}>
          Export PDF…
        </button>
        <button
          type="button"
          className="preview-button preview-close"
          title="Close Preview (Esc)"
          aria-label="Close Preview"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  )
}
