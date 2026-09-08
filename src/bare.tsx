// WHY a second, bare entry exists at all: tests/stock_pixels.mjs is the gate that
// proves the whole point of this lab — that the chrome stack (Tailwind + shadcn +
// Base UI) changes zero pixels of what tldraw itself paints. Proving that needs a
// control: a page with the identical board and *only* tldraw's own stylesheet, so
// its screenshot is the ground truth the chrome-laden index.html gets diffed
// against. It shares src/board/mount.tsx and src/board/seed.ts with App.tsx so the
// two boards cannot drift apart — only the CSS import list below differs.
import 'tldraw/tldraw.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Board } from './board/mount'

// WHY this switch lives on bare.tsx itself rather than inside Board: `?seed=`
// already reads once at module scope in mount.tsx because both entries share
// it identically, but `?inspector=1` is bare-only — index.html (the chrome
// entry) always mounts the Inspector, no switch needed. This is the "stock
// route": the Inspector on a canvas with NONE of `CONFIGURED_SHAPE_UTILS`
// registered, so every `paint` row it draws must withhold itself
// (`paintReaches(shape, editor)` false in inspectorModel.ts) instead of
// writing `meta` that changes no pixel — the dishonest-control failure the
// route exists to disprove. See docs/log.md's M2 entry.
const inspectorMode = new URLSearchParams(window.location.search).get('inspector') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Board withInspector={inspectorMode} />
  </StrictMode>,
)
