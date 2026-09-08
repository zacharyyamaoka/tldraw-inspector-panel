import { Board } from './board/mount'
import { StockCheckButton } from './compat/StockCheckButton'
import { CONFIGURED_SHAPE_UTILS } from './inspector/configuredUtils'
import { Inspector } from './inspector/Inspector'

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
// WHY SharePanel: StockCheckButton lives here too, not in board/mount.tsx:
// M4's first cut wired it as a hard-coded default inside Board itself, which
// put an unstyled copy of the button on bare.html — the pixel gate's control
// — since bare.html shares that one mount. M2's own `components`/`shapeUtils`
// pass-through refactor (see mount.tsx's own WHY) already exists to prevent
// exactly this: every entry states its own chrome in full, so a control only
// this route wants belongs in this route's own components map. bare.html
// passes no components at all and stays untouched.
export default function App() {
  return (
    <Board
      components={{ StylePanel: Inspector, SharePanel: StockCheckButton }}
      shapeUtils={CONFIGURED_SHAPE_UTILS}
    />
  )
}
