// WHY a second, bare entry exists at all: tests/stock_pixels.mjs is the gate that
// proves the whole point of this lab — that the chrome stack (Tailwind + shadcn +
// Base UI) changes zero pixels of what tldraw itself paints. Proving that needs a
// control: a page with the identical board and *only* tldraw's own stylesheet, so
// its screenshot is the ground truth the chrome-laden index.html gets diffed
// against. It shares src/board/mount.tsx and src/board/seed.ts with App.tsx so the
// two boards cannot drift apart — only the CSS import list below differs.
import 'tldraw/tldraw.css'
import './styles/host.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Board } from './board/mount'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Board />
  </StrictMode>,
)
