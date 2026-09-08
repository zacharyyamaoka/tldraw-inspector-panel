/**
 * "Add colour" needs all 14 `TLDefaultColor` roles from one picked hex, for
 * both the light and the dark palette — tldraw's own designers hand-tuned
 * the stock thirteen, and this app has no equivalent design pass to run per
 * custom colour. The formula below is deliberately simple and documented
 * rather than an attempt to reverse-engineer tldraw's actual palette math:
 * `solid`/`fill` are the picked hex itself, every wash-like role
 * (`semi`/`pattern`/`linedFill`/the frame and note fills) is a mix toward
 * white (light mode) or black (dark mode) at a fixed ratio per role, and the
 * two text-on-a-wash roles (`frameText`/`noteText`) mix the OTHER way for
 * contrast. `highlightSrgb`/`highlightP3` are the raw hex — this app has no
 * P3-gamut conversion available, so both roles get the same sRGB value; a
 * real P3 palette would diverge slightly on a wide-gamut display.
 */
import type { TLDefaultColor } from 'tldraw'

function clampChannel(value: number): number {
	return Math.min(255, Math.max(0, Math.round(value)))
}

function parseHex6(hex: string): [number, number, number] {
	const normalized = hex.trim().toLowerCase()
	const match = /^#?([0-9a-f]{6})$/.exec(normalized)
	if (!match) throw new Error(`not a 6-digit hex colour: ${hex}`)
	const value = match[1]
	return [
		Number.parseInt(value.slice(0, 2), 16),
		Number.parseInt(value.slice(2, 4), 16),
		Number.parseInt(value.slice(4, 6), 16),
	]
}

function toHex6([r, g, b]: [number, number, number]): string {
	return `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`
}

/** Linear-interpolate `hex` toward white (`toward: 'white'`) or black
 *  (`toward: 'black'`) by `ratio` (0 = `hex` unchanged, 1 = pure white/black). */
export function mixHex(hex: string, toward: 'white' | 'black', ratio: number): string {
	const [r, g, b] = parseHex6(hex)
	const target = toward === 'white' ? 255 : 0
	const t = Math.min(1, Math.max(0, ratio))
	return toHex6([
		r + (target - r) * t,
		g + (target - g) * t,
		b + (target - b) * t,
	])
}

/** `custom-<hex>`, the name `derivePaletteEntry`'s caller registers both
 *  palettes under — matches this file's own hex validation, so a name built
 *  from it is always well-formed. */
export function customColorName(hex: string): string {
	const [r, g, b] = parseHex6(hex)
	return `custom-${toHex6([r, g, b]).slice(1)}`
}

/**
 * All 14 `TLDefaultColor` roles for one hex, in one palette's direction.
 *
 * `light` washes toward white and darkens its two text roles toward black;
 * `dark` does the reverse, matching the shape of tldraw's own light/dark
 * palettes (a light-mode fill is a pale tint, a dark-mode fill is a dim
 * shade) without claiming to reproduce their exact numbers.
 */
export function deriveThemeColorRoles(hex: string, mode: 'light' | 'dark'): TLDefaultColor {
	const wash = mode === 'light' ? 'white' : 'black'
	const ink = mode === 'light' ? 'black' : 'white'
	const mix = (ratio: number) => mixHex(hex, wash, ratio)
	return {
		solid: hex,
		semi: mix(0.82),
		pattern: mix(0.35),
		fill: hex,
		linedFill: mix(0.15),
		frameHeadingStroke: hex,
		frameHeadingFill: mix(0.88),
		frameStroke: hex,
		frameFill: mix(0.92),
		frameText: mixHex(hex, ink, 0.35),
		noteFill: mix(0.55),
		noteText: mixHex(hex, ink, 0.55),
		highlightSrgb: hex,
		highlightP3: hex,
	}
}
