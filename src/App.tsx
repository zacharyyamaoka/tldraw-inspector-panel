import { Board } from './board/mount'

// WHY dynamically imported behind a query switch, never statically: this is the
// pixel gate's mutation check (tests/stock_pixels.mjs step 3) — it proves the gate
// can actually fail by re-introducing the one CSS file the layers-only import in
// app.css exists to keep out, and its diff against bare.html must come back > 0.
// It must never load on a normal visit, so it stays behind `?preflight=1` and
// dynamic import rather than a static one some future edit could hoist to the top.
if (new URLSearchParams(window.location.search).get('preflight') === '1') {
  void import('tailwindcss/preflight.css')
}

export default function App() {
  return <Board />
}
