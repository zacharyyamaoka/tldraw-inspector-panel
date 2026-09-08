/**
 * Coordinator add-on to the round-2 brief, mid-task: a one-click switch
 * between this app's own Inspector dock and tldraw's stock
 * `DefaultStylePanel`, so the two can be compared on the same shape without
 * leaving the board — "this is exactly what the lab is for."
 *
 * Same read-once-at-startup contract as `getVariant`/`readStoredDockWidth`
 * (this file's siblings in `theme.ts`): no entry re-renders from a cold
 * load, so there is nothing for a hook to react to. `?panel=` on the URL
 * always wins (over localStorage) — that is load-bearing for
 * `tests/stock_pixels.mjs`'s own mutation-style check, which navigates to
 * `index.html?seed=stock&panel=stock` and must see the stock panel exactly
 * because the query said so, never because a PREVIOUS run's localStorage
 * flip happened to agree. localStorage read/write is skipped on a `?seed=`
 * run with no `panel=` of its own, the same rule `readStoredDockWidth`
 * follows — a seeded journey must never inherit a mode a previous run left
 * behind.
 */
export type PanelMode = 'inspector' | 'stock'

const PANEL_MODE_KEY = 'tldraw_styling_lab.panelMode'
const DEFAULT_MODE: PanelMode = 'inspector'

function seeded(): boolean {
	return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('seed')
}

function clampMode(raw: string | null): PanelMode | null {
	return raw === 'stock' ? 'stock' : raw === 'inspector' ? 'inspector' : null
}

export function readPanelMode(): PanelMode {
	if (typeof window === 'undefined') return DEFAULT_MODE
	const params = new URLSearchParams(window.location.search)
	const fromQuery = clampMode(params.get('panel'))
	if (fromQuery) return fromQuery
	if (seeded()) return DEFAULT_MODE
	return clampMode(window.localStorage.getItem(PANEL_MODE_KEY)) ?? DEFAULT_MODE
}

export function writePanelMode(mode: PanelMode): void {
	if (seeded() || typeof window === 'undefined') return
	window.localStorage.setItem(PANEL_MODE_KEY, mode)
}
