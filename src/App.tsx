import { Board, readSeedMode } from './board/mount'
import { CONFIGURED_SHAPE_UTILS } from './inspector/configuredUtils'
import { Inspector } from './inspector/Inspector'
import { readStoredThemes } from './inspector/themeStorage'

// WHY dynamically imported behind a query switch, never statically: this is the
// pixel gate's mutation check (tests/stock_pixels.mjs step 3) — it proves the gate
// can actually fail by re-introducing the one CSS file the layers-only import in
// app.css exists to keep out, and its diff against bare.html must come back > 0.
// It must never load on a normal visit, so it stays behind `?preflight=1` and
// dynamic import rather than a static one some future edit could hoist to the top.
if (new URLSearchParams(window.location.search).get('preflight') === '1') {
  void import('tailwindcss/preflight.css')
}

// WHY the chrome entry always mounts the Inspector and the configured utils,
// with no query switch of its own: this is the real app, and the whole point
// of M2 is that its right dock IS the Figma-shaped inspector, not tldraw's
// own style panel — see docs/log.md's M2 entry.
//
// WHY `SharePanel` is gone: the drawer feature's own adversarial-judge round
// found it moved `DefaultStylePanel` down (y:8 -> y:34, unmasked measurement
// 22,233px) because M4's `StockCheckButton` lived in `components.SharePanel`
// — a real flow SIBLING stacked above the style panel in tldraw's own
// top-right column. `Inspector.tsx` now renders `StockCheckButton` itself,
// `position: fixed` alongside the drawer tab — never a flow sibling of
// `DefaultStylePanel` — so nothing pushes the stock panel out of the exact
// position `bare.html` puts it in. See `Inspector.tsx`'s own WHY on its
// control cluster.
//
// WHY `themes` is read here, in the one entry that owns it, rather than
// inside `Board`: M3's Theme tab is exactly the kind of chrome
// `components`/`shapeUtils` already model as a per-entry decision — `stock.tsx`
// deliberately never reads it (an otherwise-completely-stock canvas needs its
// palette to actually be tldraw's own, unregistered custom colours included),
// and `bare.tsx` never touches it at all. A `?seed=` run skips it the same way
// it skips `persistenceKey` inside `Board` — see `themeStorage.ts`.
export default function App() {
  const seedMode = readSeedMode()
  return (
    <Board
      components={{ StylePanel: Inspector }}
      shapeUtils={CONFIGURED_SHAPE_UTILS}
      themes={seedMode ? undefined : readStoredThemes()}
    />
  )
}
