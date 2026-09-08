import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { useCallback, useState } from 'react'
import { Tldraw, type Editor, type TLAnyShapeUtilConstructor, type TLComponents, type TLThemes } from 'tldraw'
import { useGestures } from '../chrome/useGestures'
import { seedStockBoard } from './seed'

// WHY self-hosted assets (@tldraw/assets/imports.vite) rather than tldraw's default
// CDN asset urls: a headless CDP journey runs Chrome with `offline: true` so it can
// never silently pass by reaching a real network — self-hosting is what makes that
// possible, and it's also what makes tests/stock_pixels.mjs's captures reproducible
// without depending on a CDN being up.
const assetUrls = getAssetUrlsByImport()

declare global {
  interface Window {
    __lab?: { editor: Editor; ready: boolean }
  }
}

// WHY read once at module scope, not in a hook: bare.tsx and index.tsx both mount
// this component from a cold page load, so there is no re-render to react to a
// change — deciding the seed mode once, the same way in both entries, is what keeps
// them from being able to drift apart.
//
// WHY exported: `App.tsx` needs the same answer to decide whether reading
// `themeStorage.ts`'s persisted theme is safe (never on a `?seed=` run — see
// that file's own WHY), and re-parsing `location.search` a second way would
// be exactly the kind of second answer that can drift from this one.
export function readSeedMode(): string | null {
  return new URLSearchParams(window.location.search).get('seed')
}

export interface BoardProps {
  /**
   * Passed straight through to `<Tldraw components={...}>`. `undefined`
   * keeps every stock default component, `DefaultStylePanel` included.
   */
  components?: TLComponents
  /**
   * Passed straight through to `<Tldraw shapeUtils={...}>`. `undefined`
   * keeps tldraw's own defaults — no paint seam, no rounded rect.
   */
  shapeUtils?: TLAnyShapeUtilConstructor[]
  /**
   * Passed straight through to `<Tldraw themes={...}>`. `undefined` keeps
   * tldraw's own `DEFAULT_THEME` — no Theme-tab edits, no custom colour
   * names registered. A caller decides this the same way it decides
   * `components`/`shapeUtils`: `App.tsx` reads `themeStorage.ts`'s persisted
   * value on a plain load, `stock.tsx` deliberately never does (see its own
   * WHY — the whole point of that route is an otherwise-completely-stock
   * canvas), and `bare.tsx` never touches it at all.
   */
  themes?: Partial<TLThemes>
}

/**
 * The one `<Tldraw>` mount shared by every entry — src/App.tsx (chrome),
 * src/stock.tsx (chrome CSS, stock shapeUtils) and src/bare.tsx (the pixel
 * gate's control). See the WHY in bare.tsx for why more than one entry exists
 * at all. Keeping this file the only place any entry constructs a board is
 * what makes "byte-identical boards, different CSS/prop stacks" a fact
 * instead of a convention someone can drift away from.
 *
 * WHY `components`/`shapeUtils` are plain pass-through props here rather than
 * this file importing `Inspector`/`CONFIGURED_SHAPE_UTILS` itself and picking
 * between them on a boolean flag (M2's first cut): a shared default lets a
 * new entry "just work" by omitting a prop, which is exactly how bare.html
 * silently grew an Inspector behind a `?inspector=1` query switch during M2 —
 * a mistake a judge caught. Every entry below states its own chrome in full;
 * there is nothing left here for a future entry to half-inherit by accident.
 */
export function Board({ components, shapeUtils, themes }: BoardProps = {}) {
  const seedMode = readSeedMode()
  // WHY held in state rather than a ref: `useGestures` is a hook and must
  // re-run when the editor actually exists, which a ref cannot signal.
  const [editor, setEditor] = useState<Editor | null>(null)
  useGestures(editor)

  const handleMount = useCallback(
    (editor: Editor) => {
      if (seedMode === 'stock') {
        seedStockBoard(editor)
      }
      window.__lab = { editor, ready: true }
      setEditor(editor)
    },
    [seedMode],
  )

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        assetUrls={assetUrls}
        // WHY no persistenceKey when a seed mode is requested: a real
        // persistenceKey autosaves into the browser's IndexedDB, so a second run
        // against the same profile would reopen yesterday's board instead of
        // seeding a fresh one. Every dev/test run that passes `?seed=` gets an
        // in-memory-only store instead; only a plain, switch-free load persists,
        // so Zach's own board on this port survives reloads.
        persistenceKey={seedMode ? undefined : 'tldraw_styling_lab'}
        onMount={handleMount}
        shapeUtils={shapeUtils}
        components={components}
        themes={themes}
      />
    </div>
  )
}
