/**
 * One monochrome glyph per stock geometry, in a 24×24 box.
 *
 * WHY hand-drawn rather than tldraw's own `geo-*` icon set: `TldrawUiIcon`
 * resolves its sprite through the UI asset-url context, and this panel renders
 * in the `InFrontOfTheCanvas` slot where that context is not guaranteed. A
 * missing icon would be an empty tile with no way to tell which geometry it is,
 * which is exactly the failure a picker cannot survive. These are inert path
 * strings with no context and no network.
 *
 * The regular polygons are computed rather than typed, so `hexagon` and
 * `octagon` cannot drift apart, and every glyph is drawn on the same inscribed
 * circle — which is what makes the grid read as one family.
 */

/** A regular n-gon inscribed in r=10 at (12,12), first vertex at the top. */
function polygon(sides: number, rotationDeg = -90, radius = 10): string {
	const points: string[] = []
	for (let index = 0; index < sides; index += 1) {
		const angle = ((rotationDeg + (360 / sides) * index) * Math.PI) / 180
		points.push(`${(12 + radius * Math.cos(angle)).toFixed(2)} ${(12 + radius * Math.sin(angle)).toFixed(2)}`)
	}
	return `M${points.join('L')}Z`
}

/** A five-pointed star: alternating outer and inner radii. */
function star(): string {
	const points: string[] = []
	for (let index = 0; index < 10; index += 1) {
		const radius = index % 2 === 0 ? 10.5 : 4.4
		const angle = ((-90 + 36 * index) * Math.PI) / 180
		points.push(`${(12 + radius * Math.cos(angle)).toFixed(2)} ${(12 + radius * Math.sin(angle)).toFixed(2)}`)
	}
	return `M${points.join('L')}Z`
}

export const GEO_GLYPHS: Record<string, string> = {
	rectangle: 'M2.5 5h19v14h-19z',
	ellipse: 'M22 12a10 7.5 0 1 1-20 0 10 7.5 0 0 1 20 0z',
	oval: 'M8.5 4.5h7a7.5 7.5 0 0 1 0 15h-7a7.5 7.5 0 0 1 0-15z',
	triangle: polygon(3),
	diamond: polygon(4),
	pentagon: polygon(5),
	hexagon: polygon(6, -90),
	octagon: polygon(8, -112.5),
	star: star(),
	rhombus: 'M7 4.5h15l-5 15H2z',
	'rhombus-2': 'M2 4.5h15l5 15H7z',
	trapezoid: 'M6.5 4.5h11l4.5 15H2z',
	'arrow-right': 'M2 9h11V4l9 8-9 8v-5H2z',
	'arrow-left': 'M22 9H11V4l-9 8 9 8v-5h11z',
	'arrow-up': 'M9 22V11H4l8-9 8 9h-5v11z',
	'arrow-down': 'M9 2v11H4l8 9 8-9h-5V2z',
	'x-box': 'M2.5 4.5h19v15h-19zM7 9l10 6M17 9L7 15',
	'check-box': 'M2.5 4.5h19v15h-19zM7 12l3.5 3.5L17.5 8',
	cloud: 'M6.5 18.5a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 16.4 8.2a4 4 0 0 1 1.1 10.3z',
	heart: 'M12 20.5S3 14.8 3 9.6A4.6 4.6 0 0 1 12 7.6a4.6 4.6 0 0 1 9 2C21 14.8 12 20.5 12 20.5z',
	/** The app's own rounded rectangle, registered through `customGeoTypes`. */
	'systemsketch-rounded-rect': 'M7 5h10a4.5 4.5 0 0 1 4.5 4.5v5A4.5 4.5 0 0 1 17 19H7a4.5 4.5 0 0 1-4.5-4.5v-5A4.5 4.5 0 0 1 7 5z',
	'excalidraw-rounded-rect': 'M7 5h10a4.5 4.5 0 0 1 4.5 4.5v5A4.5 4.5 0 0 1 17 19H7a4.5 4.5 0 0 1-4.5-4.5v-5A4.5 4.5 0 0 1 7 5z',
}

/** Which glyphs are drawn as an outline rather than filled. */
export const STROKED_GLYPHS = new Set(['x-box', 'check-box'])

/**
 * The glyph printed at the head of a scrubbable field, and its drag handle.
 *
 * WHY these are drawn rather than typed: the first version used characters like
 * `⌝ ◑ ⌷ ⇥` and every one of them fell back to a box, a stray tick or nothing
 * at all in the UI font stack — so the mark identifying the control Zach named
 * (Opacity) rendered as an unrecognisable ~6px smudge. A field's glyph is how
 * Figma names it, so it has to be legible; a path has no font to miss.
 *
 * All drawn in a 16x16 box, stroked, so they sit on one optical weight.
 */
export const FIELD_GLYPHS: Record<string, string> = {
	x: 'M4 4l8 8M12 4l-8 8',
	y: 'M4 4l4 5 4-5M8 9v3',
	w: 'M2 4v8M14 4v8M2 8h12',
	h: 'M4 2h8M4 14h8M8 2v12',
	angle: 'M3 13h10M3 13L11 4',
	opacity: 'M8 2a6 6 0 1 0 0 12zM8 2a6 6 0 1 1 0 12',
	scale: 'M3 3h4M3 3v4M13 13H9M13 13V9M3 3l10 10',
	radius: 'M3 13V7a4 4 0 0 1 4-4h6',
	weight: 'M2 5h12M2 8h12M2 11h12',
	type: 'M3 4h10M8 4v9M6 13h4',
	lineHeight: 'M8 2v12M5 5L8 2l3 3M5 11l3 3 3-3',
	padding: 'M2 2h12v12H2zM5 5h6v6H5z',
	position: 'M8 2v12M2 8h12',
	bend: 'M3 12C3 6 8 4 13 4',
	along: 'M2 8h12M5 5L2 8l3 3M11 5l3 3-3 3',
	ring: 'M2 3h12v10H2zM5 6h6v4H5z',
	fit: 'M3 8h10M10 5l3 3-3 3',
}
