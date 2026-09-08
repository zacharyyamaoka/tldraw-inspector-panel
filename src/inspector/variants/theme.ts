/**
 * The three variants share one skeleton (`kit.tsx`) and one behaviour
 * contract (whole-field scrub, resizable dock — both mandatory, both live
 * in `ScrubNumber.tsx`/`Inspector.tsx` regardless of variant). What actually
 * differs is a THEME plus a few layout decisions, gathered here so
 * `Inspector.tsx`/`ThemePanel.tsx` branch on one small table instead of
 * three forked files.
 *
 * The palette itself is NOT here — it lives in `src/styles/app.css`'s
 * `[data-variant]` blocks, because it has to reach both the dock (a normal
 * descendant) and re-point tokens (`--background`, `--foreground`, …) the
 * existing shadcn-flavoured markup in Inspector.tsx/ThemePanel.tsx already
 * reads — see that file's own WHY. `data-variant` on the dock root
 * (`[data-testid="inspector"]`) is the only wire between the two: this
 * module decides WHICH number, CSS decides what it looks like.
 */
import { GEO_GLYPHS } from '../glyphs'

export type VariantId = 1 | 2 | 3

export interface VariantTheme {
	id: VariantId
	key: string
	name: string
	/** One line, printed in the gallery and nowhere else — not UI copy. */
	tagline: string
	/** Caption-above-field (V1/V2) vs. letter-prefix-inside-field (V3) for the
	 *  geometry scalars a prefix reads naturally on (x/y/w/h/rotation/opacity). */
	inlinePrefixes: boolean
	/** Which `FieldSpec` ids draw their options from `TLDRAW_ICONS`
	 *  (`tldrawIcons.tsx`) instead of a text label. `'all'` is V2's own
	 *  brief verbatim — "every enum tldraw itself draws an icon for" — every
	 *  other variant names the open-pencil split by hand (icons for
	 *  alignment, words for fill/dash/size/font). An id absent from
	 *  `TLDRAW_ICONS` (`geo` — the app's own rounded-rect has no tldraw
	 *  asset, see that file's WHY) always falls back to the hand-drawn
	 *  `GEO_GLYPHS`/`ARROWHEAD_PATHS` tiles regardless of this setting. */
	iconControlIds: 'all' | Set<string>
	/** An enum with more than this many options collapses to a Select
	 *  instead of a segmented control. V1/V2 never do this (Infinity); V3's
	 *  brief calls it out by name for font/fill-style/dash. */
	selectThreshold: number
}

export const VARIANTS: Record<VariantId, VariantTheme> = {
	1: {
		id: 1,
		key: 'verbatim',
		name: 'Verbatim',
		tagline: "Open-pencil's own palette and geometry, ported literally.",
		inlinePrefixes: false,
		iconControlIds: new Set(['align', 'verticalAlign', 'textAlign']),
		selectThreshold: Number.POSITIVE_INFINITY,
	},
	2: {
		id: 2,
		key: 'canvas-native',
		name: 'Canvas-native',
		tagline: "tldraw's own palette and icon set, same geometry as Verbatim.",
		inlinePrefixes: false,
		iconControlIds: 'all',
		selectThreshold: Number.POSITIVE_INFINITY,
	},
	3: {
		id: 3,
		key: 'inline',
		name: 'Inline',
		tagline: 'Letter-prefixed fields, Selects for wide enums — the densest of the three.',
		inlinePrefixes: true,
		iconControlIds: new Set(['align', 'verticalAlign', 'textAlign']),
		selectThreshold: 4,
	},
}

/** The letter/symbol open-pencil prints INSIDE a V3 field instead of a
 *  caption row above it (Figma's own convention for the geometry set).
 *  Absent from this map, a V3 field keeps its caption — most rows (fill
 *  alpha, label padding, …) have no one-glyph name that reads on sight. */
export const INLINE_PREFIXES: Record<string, string> = {
	x: 'X', y: 'Y', w: 'W', h: 'H', rotation: '°', opacity: '%',
}

const DEFAULT_VARIANT: VariantId = 1

function clampVariant(raw: string | null): VariantId {
	const parsed = Number(raw)
	return parsed === 1 || parsed === 2 || parsed === 3 ? (parsed as VariantId) : DEFAULT_VARIANT
}

/**
 * Read once at startup, same rule as `readSeedMode` (`src/board/mount.tsx`):
 * no entry re-renders from a cold load, so there is nothing for a hook to
 * react to, and re-parsing `location.search` a second way is how two
 * answers drift apart.
 */
export function getVariant(): VariantId {
	if (typeof window === 'undefined') return DEFAULT_VARIANT
	return clampVariant(new URLSearchParams(window.location.search).get('variant'))
}

/** The URL a variant-picker segment reloads to — same search string, one
 *  param replaced, so `?seed=stock&variant=1` survives the switch during a
 *  journey and a plain `?variant=2` does on a normal visit. */
export function variantUrl(id: VariantId): string {
	const url = new URL(window.location.href)
	url.searchParams.set('variant', String(id))
	return url.toString()
}

/* ------------------------------------------------------- dock resize --- */

export const DOCK_WIDTH_MIN = 240
export const DOCK_WIDTH_MAX = 480
export const DOCK_WIDTH_DEFAULT = 280
const DOCK_WIDTH_KEY = 'tldraw_styling_lab.dockWidth'

/** Skipped on a `?seed=` run for the same reason `persistenceKey` is (see
 *  `mount.tsx`): a journey that persisted its drag width would make every
 *  later run of that journey start from whatever width the LAST run left
 *  behind, instead of the documented 280px default every check assumes. */
function seeded(): boolean {
	return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('seed')
}

export function readStoredDockWidth(): number {
	if (seeded() || typeof window === 'undefined') return DOCK_WIDTH_DEFAULT
	const raw = Number(window.localStorage.getItem(DOCK_WIDTH_KEY))
	if (!Number.isFinite(raw) || raw < DOCK_WIDTH_MIN || raw > DOCK_WIDTH_MAX) return DOCK_WIDTH_DEFAULT
	return raw
}

export function writeStoredDockWidth(width: number): void {
	if (seeded() || typeof window === 'undefined') return
	window.localStorage.setItem(DOCK_WIDTH_KEY, String(width))
}

/** A regular geometry glyph doubles as an enum-icon fallback when a V1/V3
 *  option name matches one (`fill`'s own values do not; `geo`'s do). Kept
 *  here rather than duplicated in kit.tsx. */
export function textGlyphPath(name: string): string | undefined {
	return GEO_GLYPHS[name]
}
