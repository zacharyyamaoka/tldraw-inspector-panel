// WHY a third entry exists: the Inspector's `paint` rows only reach real
// pixels because `CONFIGURED_SHAPE_UTILS` (src/inspector/configuredUtils.ts)
// installs `getCustomDisplayValues` on the stock ShapeUtils — and the whole
// point of the model's `paintReaches(shape, editor)` gate
// (src/inspector/inspectorModel.ts) is that a route WITHOUT that seam must
// withhold those rows rather than write `meta` that changes no pixel. Proving
// that honestly needs the Inspector mounted on a canvas that is otherwise
// completely stock — no configured utils, no rounded rect — which is neither
// of the other two entries: index.html has both, and bare.html (the pixel
// gate's control, tests/stock_pixels.mjs) must load only tldraw.css so it
// stays the ground truth the chrome-laden index.html gets diffed against.
// This route carries the full chrome stack (Tailwind/shadcn/Base UI) so the
// Inspector renders with its real styling; only `shapeUtils` is left unset.
import 'tldraw/tldraw.css'
import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Board } from './board/mount'
import { Inspector } from './inspector/Inspector'

// WHY no `SharePanel` here either: `Inspector` renders `StockCheckButton`
// itself now (`position: fixed`, alongside the drawer tab) — see
// `App.tsx`'s own WHY. The button still rides along on this route, just
// through the same seam the drawer already owns rather than a second
// `components` wire.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Board components={{ StylePanel: Inspector }} />
  </StrictMode>,
)
