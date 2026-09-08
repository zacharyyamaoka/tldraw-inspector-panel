/**
 * Where the Theme tab's edits live between sessions.
 *
 * WHY `localStorage`, not the document: `editor.updateThemes` is deliberately
 * NOT tracked by tldraw's own undo stack (see `ThemeManager.ts` — it lives on
 * a plain `Atom`, never in the record store `UndoManager` walks), because a
 * theme is app-global state, not a property of any one shape or document.
 * Persisting it the same way `persistenceKey` persists the board would put
 * app state inside document state — the same category error `persistenceKey`
 * itself is skipped for on a seeded/test load (see `board/mount.tsx`), and
 * for the identical reason: a `?seed=` run must never read, or write,
 * whatever a person left in their own browser.
 */
import type { TLThemes } from 'tldraw'

const STORAGE_KEY = 'tldraw_styling_lab.themes'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

/** `undefined` on a private window, a first run, or corrupt JSON — every
 *  caller already treats "no themes" as "use tldraw's own defaults". */
export function readStoredThemes(): Partial<TLThemes> | undefined {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (!raw) return undefined
		const parsed: unknown = JSON.parse(raw)
		return isRecord(parsed) ? (parsed as Partial<TLThemes>) : undefined
	} catch {
		return undefined
	}
}

export function writeStoredThemes(themes: TLThemes): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(themes))
	} catch {
		// A full quota or a private window must not break editing the theme —
		// the edit still applies live, it just will not survive a reload.
	}
}

export function clearStoredThemes(): void {
	try {
		window.localStorage.removeItem(STORAGE_KEY)
	} catch {
		// See writeStoredThemes.
	}
}
