import React, { type CSSProperties } from 'react'
import { elementIndents, page, pageNumber, sceneNumberMargins } from './lib/screenplayLayout'
import type { PrintedScreenplay, Row, Span } from './lib/printLayout'

const inches = (value: number): string => `${value}in`

// Rows are 12pt high (6 lines per inch), as in the pagination.
const rowHeight = inches(1 / 6)

// Distance of the contact and date block from the sides and bottom of the title page, in inches.
const titlePageFooter = { side: 0.76, bottom: 1.2 }

const pageStyle: CSSProperties = {
  width: inches(page.width),
  height: inches(page.height),
  paddingTop: inches(page.top)
}

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

// A block of rows at the bottom of the title page, aligned to the left or right.
function TitleBlock({
  rows,
  align
}: {
  rows: Span[][]
  align: 'left' | 'right'
}): React.JSX.Element {
  return (
    <div className="print-title-bottom" style={{ textAlign: align }}>
      {rows.map((spans, k) => (
        <div key={k} className="print-row">
          <Text spans={spans} />
        </div>
      ))}
    </div>
  )
}

// The screenplay as printed pages. It is only shown when printing, which is how PDFs are exported.
export function PrintView({ screenplay }: { screenplay: PrintedScreenplay }): React.JSX.Element {
  const { titlePage, pages } = screenplay
  return (
    <div className="print" style={{ '--row-height': rowHeight } as CSSProperties}>
      {titlePage && (
        <section className="print-page print-title-page" style={pageStyle}>
          {/* The title sits about a third of the way down the page. */}
          <div style={{ marginTop: `calc(18 * ${rowHeight})`, textAlign: 'center' }}>
            {titlePage.center.map((spans, k) => (
              <div key={k} className="print-row">
                <Text spans={spans} />
              </div>
            ))}
          </div>
          <div
            className="print-title-footer"
            style={{
              left: inches(titlePageFooter.side),
              right: inches(titlePageFooter.side),
              bottom: inches(titlePageFooter.bottom)
            }}
          >
            <TitleBlock rows={titlePage.bottomLeft} align="left" />
            <TitleBlock rows={titlePage.bottomRight} align="right" />
          </div>
        </section>
      )}
      {pages.map((printed, n) => (
        <section key={n} className="print-page" style={pageStyle}>
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
      ))}
    </div>
  )
}
