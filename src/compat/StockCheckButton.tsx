import { useCallback, useState } from 'react'
import { useEditor, useValue } from 'tldraw'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { StockCheckReport } from './StockCheckReport'
import { releaseStockCheckResult, runStockCheck, type StockCheckResult } from './stockCheck'

// WHY mounted through components.SharePanel rather than a new top-level component
// key: the top-right slot is the seam tldraw already ships for exactly this kind
// of app-owned, non-canvas action (Share/collaboration by default; nothing here
// when collaboration is off, which is why the pixel gate previously saw it as
// blank) — see src/board/mount.tsx's WHY and docs/log.md's M4 entry for what this
// does to tests/stock_pixels.mjs's byte-exact assumption.
export function StockCheckButton() {
  const editor = useEditor()
  const shapeCount = useValue('stock-check-shape-count', () => editor.getCurrentPageShapeIds().size, [editor])
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<StockCheckResult | null>(null)

  const handleRun = useCallback(async () => {
    setOpen(true)
    setRunning(true)
    setResult(null)
    try {
      const outcome = await runStockCheck(editor)
      setResult(outcome)
    } catch (error) {
      setResult({ ok: false, reason: `internal error while running the check: ${String(error)}`, detail: error })
    } finally {
      setRunning(false)
    }
  }, [editor])

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) {
      // WHY release on close, not on unmount: object URLs from a finished run must
      // not accumulate across repeated opens in one session — the leak the M4
      // journey's "container count returns to 1" assertion exists to catch is the
      // <Tldraw> mount, but URLs are the other thing a "run it again" flow can leak.
      setResult((current) => {
        releaseStockCheckResult(current)
        return null
      })
    }
  }, [])

  return (
    // WHY pointer-events-auto on both the zone and the button: tldraw's whole
    // `.tlui-layout` overlay grid is `pointer-events: none` so it never steals
    // clicks meant for the canvas underneath it — every real tldraw UI control
    // opts back in individually. Miss this and the button LOOKS clickable
    // (visible, in the right slot, no console error) but every click passes
    // straight through to the canvas; caught by tests/compat_smoke.mjs hanging
    // on the report selector rather than by any visible symptom.
    <div className="tlui-share-zone pointer-events-auto" draggable={false}>
      <Button
        variant="outline"
        size="sm"
        className="pointer-events-auto"
        disabled={shapeCount === 0}
        title={shapeCount === 0 ? 'Nothing on the board to check yet' : undefined}
        onClick={handleRun}
        data-testid="stock-check-button"
      >
        Stock check
      </Button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] max-w-none overflow-y-auto sm:max-w-none" data-testid="stock-check-sheet">
          <SheetHeader>
            <SheetTitle>Stock tldraw compatibility</SheetTitle>
            <SheetDescription>
              Exports this board, reopens it in an unconfigured stock tldraw, and diffs what each
              side actually paints — whole board first, then every shape, ranked by divergence.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {running && <p className="text-sm text-muted-foreground" data-testid="stock-check-running">Running…</p>}
            {!running && result && <StockCheckReport result={result} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
