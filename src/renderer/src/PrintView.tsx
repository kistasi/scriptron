import React, { type CSSProperties } from 'react'
import { elementIndents, page, pageNumber, sceneNumberMargins } from './lib/screenplayLayout'
import type { PrintedPage, PrintedScreenplay, Row, Span, TitlePage } from './lib/printLayout'

const inches = (value: number): string => `${value}in`

// Rows are 12pt high (6 lines per inch), as in the pagination.
const rowHeight = inches(1 / 6)

// Distance of the contact and date block from the sides and bottom of the title page, in inches.
const titlePageFooter = { side: 0.76, bottom: 1.2 }

const pageStyle = {
  width: inches(page.width),
  height: inches(page.height),
  paddingTop: inches(page.top),
  '--row-height': rowHeight
} as CSSProperties

function rowStyle(type: Row['type']): CSSProperties {
  const indent = elementIndents[type === 'more' ? 'character' : type] ?? { left: 0, right: 0 }
  return {
    paddingLeft: inches(page.left + indent.left),
    paddingRight: inches(page.right + indent.right)
  }
}

function Text({ spans }: { spans: Span[] }): React.JSX.Element {
  return (
    <>
      {spans.map(({ text, bold, italic, underline }, k) =>
        bold || italic || underline ? (
          <span
            key={k}
            style={{
              fontWeight: bold ? 'bold' : undefined,
              fontStyle: italic ? 'italic' : undefined,
              textDecoration: underline ? 'underline' : undefined
            }}
          >
            {text}
          </span>
        ) : (
          text
        )
      )}
    </>
  )
}

// A block of the title page's rows, aligned to the left, right or center.
function TitleBlock({
  rows,
  align,
  className,
  style
}: {
  rows: Span[][]
  align: 'left' | 'right' | 'center'
  className?: string
  style?: CSSProperties
}): React.JSX.Element {
  return (
    <div className={className} style={{ ...style, textAlign: align }}>
      {rows.map((spans, k) => (
        <div key={k} className="print-row">
          <Text spans={spans} />
        </div>
      ))}
    </div>
  )
}

// The printed title page.
export function TitleSheet({ titlePage }: { titlePage: TitlePage }): React.JSX.Element {
  return (
    <section className="print-page print-title-page" style={pageStyle}>
      {/* The title sits about a third of the way down the page. */}
      <TitleBlock
        rows={titlePage.center}
        align="center"
        style={{ marginTop: `calc(18 * ${rowHeight})` }}
      />
      <div
        className="print-title-footer"
        style={{
          left: inches(titlePageFooter.side),
          right: inches(titlePageFooter.side),
          bottom: inches(titlePageFooter.bottom)
        }}
      >
        <TitleBlock rows={titlePage.bottomLeft} align="left" className="print-title-bottom" />
        <TitleBlock rows={titlePage.bottomRight} align="right" className="print-title-bottom" />
      </div>
    </section>
  )
}

// One printed page of the screenplay.
export function PageSheet({ printed }: { printed: PrintedPage }): React.JSX.Element {
  return (
    <section className="print-page" style={pageStyle}>
      {printed.number !== null && (
        <div
          className="print-row print-page-number"
          style={{ top: inches(pageNumber.top), right: inches(pageNumber.right) }}
        >
          {printed.number}.
        </div>
      )}
      {printed.rows.map((row, k) =>
        row === null ? (
          <div key={k} className="print-row" />
        ) : (
          <div key={k} className={`print-row print-${row.type}`} style={rowStyle(row.type)}>
            {row.scene !== undefined && (
              <>
                <span
                  className="print-scene-number"
                  style={{ left: inches(sceneNumberMargins.left) }}
                >
                  {row.scene}
                </span>
                <span
                  className="print-scene-number"
                  style={{ right: inches(sceneNumberMargins.right) }}
                >
                  {row.scene}
                </span>
              </>
            )}
            <Text spans={row.spans} />
          </div>
        )
      )}
    </section>
  )
}

// The screenplay as printed pages. It is only shown when printing, which is how PDFs are exported.
export function PrintView({ screenplay }: { screenplay: PrintedScreenplay }): React.JSX.Element {
  const { titlePage, pages } = screenplay
  return (
    <div className="print">
      {titlePage && <TitleSheet titlePage={titlePage} />}
      {pages.map((printed, n) => (
        <PageSheet key={n} printed={printed} />
      ))}
    </div>
  )
}
