/**
 * Which menu treatment to render. `?menu=1|2|3`, defaulting to 1.
 *
 * WHY a query param and not a setting: these are three PROTOTYPES for Zach to
 * compare, not a preference anyone keeps. The variant system in
 * `src/inspector/variants/theme.ts` reads its own switch the same way, and for
 * the same reason — a reviewer wants two tabs open side by side, which a
 * persisted setting cannot give them.
 */
export type MenuVariant = 1 | 2 | 3

/**
 * V3 is the DEFAULT now — Zach picked it after the /babble comparison ("I agree
 * with this please implement it: V3 App bar + Settings"). V1 and V2 stay
 * reachable at `?menu=1` / `?menu=2` so the comparison in
 * reports/menu-babble-2026-09-08.html keeps working rather than rotting the
 * moment a winner is chosen.
 */
export function readMenuVariant(): MenuVariant {
	if (typeof window === 'undefined') return 3
	const raw = Number(new URLSearchParams(window.location.search).get('menu'))
	return raw === 1 || raw === 2 ? raw : 3
}

export const MENU_VARIANT_NAMES: Record<MenuVariant, string> = {
	1: 'Native submenus',
	2: 'One Board menu',
	3: 'App bar + Settings',
}
