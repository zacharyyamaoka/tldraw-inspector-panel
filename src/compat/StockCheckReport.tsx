import type { ReactNode } from 'react'
import { tldrDownloadUrl, type StockCheckResult } from './stockCheck'

// WHY plain <table> + Tailwind classes, not a shadcn/Base UI data-grid: the M4
// brief calls this out explicitly — "a table (<table> with Tailwind classes is
// fine)" — the report has no interactive grid behaviour (sort/resize/reorder)
// that would justify a component over the element that already means "table".
function Chip({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'neutral'; children: ReactNode }) {
  const toneClass = {
    green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    neutral: 'bg-muted text-muted-foreground',
  }[tone]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>{children}</span>
}

function readingFor(changed: number): { tone: 'green' | 'amber' | 'red'; label: string } {
  if (changed === 0) return { tone: 'green', label: 'identical in stock tldraw' }
  if (changed < 200) return { tone: 'amber', label: 'minor divergence' }
  return { tone: 'red', label: 'diverges from stock tldraw' }
}

function Triptych({
  lab, stock, diff, labLabel = 'Lab', stockLabel = 'Stock',
}: {
  lab: { url: string }; stock: { url: string }; diff: { url: string }
  labLabel?: string; stockLabel?: string
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <figure className="m-0">
        <img src={lab.url} alt={`${labLabel} render`} className="w-full rounded border border-border bg-white" />
        <figcaption className="mt-1 text-center text-xs text-muted-foreground">{labLabel}</figcaption>
      </figure>
      <figure className="m-0">
        <img src={stock.url} alt={`${stockLabel} render`} className="w-full rounded border border-border bg-white" />
        <figcaption className="mt-1 text-center text-xs text-muted-foreground">{stockLabel}</figcaption>
      </figure>
      <figure className="m-0">
        <img src={diff.url} alt="Pixel difference map" className="w-full rounded border border-border bg-white" />
        <figcaption className="mt-1 text-center text-xs text-muted-foreground">Diff</figcaption>
      </figure>
    </div>
  )
}

export function StockCheckReport({ result }: { result: StockCheckResult }) {
  if (!result.ok) {
    return (
      <div
        data-testid="stock-check-refused"
        className="rounded-md border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      >
        <p className="font-semibold">Stock tldraw refuses this file</p>
        <p className="mt-1 text-sm">{result.reason}</p>
      </div>
    )
  }

  // WHY refusals force the whole-board reading red regardless of pixel count:
  // a record stock tldraw would refuse outright is a harder failure than any
  // amount of paint divergence — the two hidden mounts sharing this page's
  // module graph can even render it identically (0 changed px) while a real,
  // separate stock tldraw process would reject the file. See
  // findStockEnumRefusals's own WHY in stockCheck.ts.
  const wholeReading = result.refusals.length > 0
    ? { tone: 'red' as const, label: 'stock tldraw would refuse part of this board' }
    : readingFor(result.wholeBoard.diff.changed)

  return (
    <div className="flex flex-col gap-6" data-testid="stock-check-results">
      {result.refusals.length > 0 && (
        <section aria-label="Records stock tldraw would refuse" data-testid="stock-check-refusals" data-count={result.refusals.length}>
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <p className="font-semibold">
              Stock tldraw would refuse {result.refusals.length} record{result.refusals.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {result.refusals.map((row, index) => (
                <li key={`${row.id}-${row.field}-${index}`} data-testid="stock-check-refusal-row" data-shape-id={row.id} data-field={row.field}>
                  <span className="font-mono text-xs">{row.id}</span> ({row.type}): stock tldraw would refuse
                  this record: {row.field} <code>'{row.value}'</code> is not a stock value
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-label="Whole board" data-testid="stock-check-whole-board" data-changed={result.wholeBoard.diff.changed}>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold">Whole board</h3>
          <Chip tone={wholeReading.tone}>
            {result.wholeBoard.diff.changed === 0
              ? wholeReading.label
              : `${result.wholeBoard.diff.changed.toLocaleString()} px differ (${result.wholeBoard.diff.pct.toFixed(2)}%)`}
          </Chip>
        </div>
        <Triptych lab={result.wholeBoard.lab} stock={result.wholeBoard.stock} diff={result.wholeBoard.diff} />
      </section>

      <section aria-label="Per-shape divergence, ranked">
        <h3 className="mb-2 text-sm font-semibold">Shapes, ranked by divergence</h3>
        {result.shapes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shapes are present on both sides.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {result.shapes.map((row) => {
              const reading = readingFor(row.diff.changed)
              return (
                <div key={row.id} className="rounded-md border border-border p-3" data-testid="stock-check-shape-row" data-shape-id={row.id} data-changed={row.diff.changed}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{row.id}</span>
                    <Chip tone="neutral">{row.type}</Chip>
                    <Chip tone={reading.tone}>
                      {row.diff.changed === 0
                        ? reading.label
                        : `${row.diff.changed.toLocaleString()} px differ (${row.diff.pct.toFixed(2)}%)`}
                    </Chip>
                  </div>
                  <Triptych lab={row.lab} stock={row.stock} diff={row.diff} />
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section aria-label="Unpaired shapes" data-testid="stock-check-unpaired">
        <h3 className="mb-2 text-sm font-semibold">Unpaired shapes</h3>
        {result.unpaired.length === 0 ? (
          <p className="text-sm text-muted-foreground">None — every shape on the board exists on both sides.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1 pr-4 font-medium">Shape</th>
                <th className="py-1 pr-4 font-medium">Type</th>
                <th className="py-1 font-medium">Only on</th>
              </tr>
            </thead>
            <tbody>
              {result.unpaired.map((row) => (
                <tr key={`${row.side}-${row.id}`} className="border-b border-border/60">
                  <td className="py-1 pr-4 font-mono text-xs">{row.id}</td>
                  <td className="py-1 pr-4">{row.type}</td>
                  <td className="py-1">{row.side === 'lab-only' ? 'Lab' : 'Stock'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Shape utils configured">
        <h3 className="mb-2 text-sm font-semibold">Shape utils configured</h3>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-medium text-muted-foreground">Lab ({result.labShapeUtilKeys.length})</p>
            <p className="font-mono">{result.labShapeUtilKeys.join(', ')}</p>
          </div>
          <div>
            <p className="font-medium text-muted-foreground">Stock ({result.stockShapeUtilKeys.length})</p>
            <p className="font-mono">{result.stockShapeUtilKeys.join(', ')}</p>
          </div>
        </div>
      </section>

      <a
        href={tldrDownloadUrl(result.tldrJson)}
        download="stock-check-export.tldr"
        className="text-sm text-primary underline-offset-4 hover:underline"
        data-testid="stock-check-download"
      >
        Download the exported .tldr
      </a>
      <p className="text-xs text-muted-foreground">
        A viewer sandbox may block this download — it is a convenience, not the proof; the diffs
        above are computed from the same bytes.
      </p>

      <footer className="border-t border-border pt-3 text-xs text-muted-foreground">
        Threshold: pixelmatch at {result.threshold} (absorbs anti-aliasing jitter between two
        independent SVG rasterizations, not real divergence). Known blind spot: the white text
        halo (<code>--tl-text-outline</code>) is a CSS variable that export does not carry, so it
        never shows up as a diff on either side even where it visually differs on-screen.
      </footer>
    </div>
  )
}
