/**
 * Zach, verbatim: "I have a nice idea for how I want the interaction to be
 * to show/hide the inspector panel. It should kinda feel like a drag out
 * window. By default it's hidden but in the top right corner there is
 * basically like a drawer button and if you press it it will slide out
 * over the stock tldraw menu." This REPLACES the earlier panel-mode switch
 * (`panelMode.ts`, deleted) — stock is now always the default paint, and
 * the Figma dock is a drawer over it, never a second mode to pick between.
 *
 * Same read-once-at-startup / skip-under-`?seed=` contract as
 * `getVariant`/`readStoredDockWidth`/the old `panelMode.ts`: no entry
 * re-renders from a cold load, and a `?seed=` journey must never inherit a
 * state a PREVIOUS run left in localStorage. `?drawer=` on the URL always
 * wins over localStorage, the same reason `?panel=` did — a journey has to
 * be able to force the state regardless of what a previous run persisted.
 */
const DRAWER_KEY = 'tldraw_styling_lab.drawerOpen'
const DEFAULT_OPEN = false

function seeded(): boolean {
	return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('seed')
}

function clampOpen(raw: string | null): boolean | null {
	return raw === 'open' ? true : raw === 'closed' ? false : null
}

export function readDrawerOpen(): boolean {
	if (typeof window === 'undefined') return DEFAULT_OPEN
	const fromQuery = clampOpen(new URLSearchParams(window.location.search).get('drawer'))
	if (fromQuery !== null) return fromQuery
	if (seeded()) return DEFAULT_OPEN
	return clampOpen(window.localStorage.getItem(DRAWER_KEY)) ?? DEFAULT_OPEN
}

export function writeDrawerOpen(open: boolean): void {
	if (seeded() || typeof window === 'undefined') return
	window.localStorage.setItem(DRAWER_KEY, open ? 'open' : 'closed')
}
