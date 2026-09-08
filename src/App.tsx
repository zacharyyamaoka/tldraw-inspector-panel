import { Board } from './board/mount'
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
export default function App() {
  return <Board components={{ StylePanel: Inspector }} shapeUtils={CONFIGURED_SHAPE_UTILS} />
}
