import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { useCallback } from 'react'
import { Tldraw, type Editor } from 'tldraw'
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
function readSeedMode(): string | null {
  return new URLSearchParams(window.location.search).get('seed')
}

/**
 * The one `<Tldraw>` mount shared by src/App.tsx (chrome entry) and src/bare.tsx
 * (the pixel gate's control entry) — see the WHY in bare.tsx for why a second entry
 * exists at all. Keeping this file the only place either entry constructs a board
 * is what makes "byte-identical boards, different CSS stacks" a fact instead of a
 * convention someone can drift away from.
 */
export function Board() {
  const seedMode = readSeedMode()

  const handleMount = useCallback(
    (editor: Editor) => {
      if (seedMode === 'stock') {
        seedStockBoard(editor)
      }
      window.__lab = { editor, ready: true }
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
      />
    </div>
  )
}
