import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { createRoot, type Root } from 'react-dom/client'
import { Tldraw, type Editor, type TLStore } from 'tldraw'

// WHY the same self-hosted asset urls as src/board/mount.tsx: the stock-check
// mount is still tldraw, still running in the same offline/CDP-driven journeys —
// the CDN default would silently try (and fail) to reach the network the moment
// this mounts a real icon or translation file.
const assetUrls = getAssetUrlsByImport()

export interface HiddenStockEditor {
  editor: Editor
  /** Unmounts the hidden <Tldraw> and removes its container — call after every run, pass or fail. */
  dispose: () => void
}

/**
 * Mounts a second, bare `<Tldraw>` against an already-parsed store, off-screen at the
 * same pixel size as the visible canvas — this is "stock tldraw" for the purposes of
 * the compat report: no shapeUtils, no components, same asset urls as the lab's own
 * mount. `toImage()` doesn't care about layout, so the offscreen position and size
 * only need to be plausible, not pixel-matched to the visible canvas' screen rect;
 * matching it anyway (rather than a fixed guess) is what the M4 spec calls for and
 * keeps toImage's internal viewport-dependent choices (if any future version adds
 * one) aligned with what a person would actually see.
 *
 * Resolves once the hidden editor's onMount has fired, so the caller can immediately
 * call toImage() against a fully-initialized editor.
 */
export function mountHiddenStockEditor(
  store: TLStore,
  size: { w: number; h: number },
): Promise<HiddenStockEditor> {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    container.setAttribute('data-stock-check-hidden', 'true')
    container.style.position = 'fixed'
    container.style.left = '-20000px'
    container.style.top = '0px'
    container.style.width = `${Math.max(1, Math.round(size.w))}px`
    container.style.height = `${Math.max(1, Math.round(size.h))}px`
    document.body.appendChild(container)

    let root: Root | null = createRoot(container)

    const dispose = () => {
      root?.unmount()
      root = null
      container.remove()
    }

    root.render(
      <Tldraw
        store={store}
        assetUrls={assetUrls}
        onMount={(editor) => resolve({ editor, dispose })}
      />,
    )
  })
}
