/**
 * The stock ShapeUtils, configured to read `overrides.ts`'s `meta` contract
 * through tldraw's public `getCustomDisplayValues` seam — the seam that makes
 * every `paint`-sourced row in `inspectorModel.ts` reach real pixels.
 *
 * Ported from SystemSketch (77907974): `src/stockPrimitiveVisuals.ts` plus the
 * `GeoShapeUtil.configure({ customGeoTypes })` call that otherwise lives in
 * `src/excalidrawInterop.ts` and the `ArrowShapeUtil.configure(...)` call that
 * lives in `src/systemSketchArrow.tsx`. Only the paint seam and the rounded
 * rectangle survive the port — everything else those donor files also do
 * (Excalidraw import fidelity, Block "detached composite" paint via
 * `appearance/fillPaint` + `appearance/strokeMeta`, the async-edge dash
 * cadence, the slanted arrow) is SystemSketch/Block-specific and out of scope
 * for a lab that proves the seam works on stock tldraw. WHY that's a safe cut:
 * every `*OverrideDisplayValues` function below already resolves to `{}` when
 * a shape carries no override, so dropping the derived-default machinery only
 * removes paint this lab never needed to reproduce, not the seam itself — with
 * one exception: `geoOverrideDisplayValues`'s `fillOpacity`-only case needs a
 * `resolvedFill` to composite the alpha onto, so it can tell "no override" from
 * "transparent". The donor computes that through `appearance/fillPaint.ts`'s
 * `fillPaintFor` — a FigJam-flavoured *reinterpretation* of solid/semi fill
 * (a wash instead of tldraw's own pale tint) that is a taste choice, not part
 * of the seam, so it stays out. `defaultGeoFillColor` below instead reproduces
 * stock tldraw's OWN default fill formula verbatim from
 * `node_modules/tldraw/src/lib/shapes/geo/GeoShapeUtil.tsx`'s
 * `getDefaultDisplayValues` (`getColorValue(colors, color,
 * DEFAULT_FILL_COLOR_NAMES[fill])`, `DEFAULT_FILL_COLOR_NAMES` inlined since
 * tldraw does not export it) — so a fill-alpha override composites onto
 * exactly what the shape would otherwise have painted, nothing invented.
 */
import {
	ArrowShapeUtil,
	DrawShapeUtil,
	FrameShapeUtil,
	GeoShapeUtil,
	HighlightShapeUtil,
	LineShapeUtil,
	NoteShapeUtil,
	PathBuilder,
	TextShapeUtil,
	defaultShapeUtils,
	getColorValue,
	type TLAnyShapeUtilConstructor,
	type SvgExportContext,
	type TLGeoShape,
	type TLThemeColors,
} from 'tldraw'

import {
	arrowOverrideDisplayValues,
	drawOverrideDisplayValues,
	geoOverrideDisplayValues,
	highlightOverrideDisplayValues,
	lineOverrideDisplayValues,
	markResolvesPrimitiveOverrides,
	noteOverrideDisplayValues,
	readPrimitiveOverride,
	textOverrideDisplayValues,
	withPrimitiveOverrides,
} from './overrides'

// WHY this value and not something named for this lab: it is what
// `inspectorModel.ts`'s Geometry row (`ROUNDED_RECT_GEO`) and the donor's
// `portableTldraw.ts` lowering both key off — keeping it means a board
// carrying this geometry means the same thing in either app, the same
// round-trip argument as the meta key in overrides.ts.
export const ROUNDED_RECT_GEO = 'rounded-rect'

// WHY read once here, at module scope, rather than passed as a prop: a
// ShapeUtil option is fixed at `.configure()` time, before any component
// mounts, so there is no re-render for a prop to react to — the same reason
// `board/mount.tsx`'s `readSeedMode()` reads `location.search` once rather
// than in a hook. Off by default: `showColors: true` unconditionally paints
// every frame differently from stock tldraw even with NO override (the
// seeded frame is plain `color: 'black'`) — `tests/compat_smoke.mjs`
// measured this as 83 changed px on an otherwise pure-record board before
// this switch existed (docs/log.md's "showColors is opt-in" entry). Stock by
// default is this lab's first rule; a frame's own colour is a real layer-2
// addition someone opts into with `?frames=colors`, not something a plain
// load silently paints.
const FRAME_COLORS_ENABLED = typeof window !== 'undefined'
	&& new URLSearchParams(window.location.search).get('frames') === 'colors'

/**
 * One reusable rounded rectangle path, ported verbatim from
 * `stockPrimitiveVisuals.ts`'s `getRoundedRectPath`.
 */
function roundedRectPath(width: number, height: number, radius: number, isFilled = false): PathBuilder {
	const w = Math.max(0, width)
	const h = Math.max(0, height)
	const r = Math.min(Math.max(0, radius), Math.min(w, h) / 2)
	if (r === 0) {
		return new PathBuilder()
			.moveTo(0, 0, { geometry: { isFilled } })
			.lineTo(w, 0)
			.lineTo(w, h)
			.lineTo(0, h)
			.close()
	}
	const k = (2 * r) / 3
	return new PathBuilder()
		.moveTo(r, 0, { geometry: { isFilled } })
		.lineTo(w - r, 0)
		.cubicBezierTo(w, r, w - r + k, 0, w, r - k)
		.lineTo(w, h - r)
		.cubicBezierTo(w - r, h, w, h - r + k, w - r + k, h)
		.lineTo(r, h)
		.cubicBezierTo(0, h - r, r - k, h, 0, h - r + k)
		.lineTo(0, r)
		.cubicBezierTo(r, 0, 0, r - k, r - k, 0)
		.close()
}

// Stock tldraw's own geo fill formula (GeoShapeUtil.tsx's
// `getDefaultDisplayValues`), reproduced rather than imported: it is not
// exported, and `DEFAULT_FILL_COLOR_NAMES` isn't either.
const DEFAULT_FILL_COLOR_NAMES = {
	solid: 'semi',
	pattern: 'pattern',
	fill: 'fill',
	'lined-fill': 'linedFill',
} as const

function defaultGeoFillColor(shape: TLGeoShape, colors: TLThemeColors): string | undefined {
	return defaultFillColorFor(shape.props, colors)
}

// WHY shared with arrow rather than re-derived: ArrowShapeUtil.tsx's own
// getDefaultDisplayValues computes fillColor with the exact same three-way
// branch over the same `color`/`fill` props — tldraw just repeats the formula
// per shape rather than exporting it once.
function defaultFillColorFor(
	props: { color: string; fill: string },
	colors: TLThemeColors,
): string | undefined {
	const { color, fill } = props
	if (fill === 'none') return undefined
	if (fill === 'semi') return colors.solid
	const variant = DEFAULT_FILL_COLOR_NAMES[fill as keyof typeof DEFAULT_FILL_COLOR_NAMES]
	return variant ? getColorValue(colors, color, variant) : undefined
}

const ConfiguredGeoShapeUtil = GeoShapeUtil.configure({
	customGeoTypes: {
		[ROUNDED_RECT_GEO]: {
			icon: 'geo-rectangle',
			snapType: 'polygon',
			getPath: (w: number, h: number, shape) =>
				roundedRectPath(w, h, readPrimitiveOverride(shape).cornerRadius ?? 0, shape.props.fill !== 'none'),
		},
	},
	getCustomDisplayValues: (_editor, shape, theme, colorMode) =>
		geoOverrideDisplayValues(shape, defaultGeoFillColor(shape, theme.colors[colorMode])),
})

/**
 * Rounded corners painted onto a shape whose RECORD stays a stock rectangle.
 *
 * WHY this indirection instead of just writing the custom geo into the record,
 * which is what this app used to do: Zach's requirement is that a board opens
 * in a plain, unconfigured stock tldraw. A record carrying
 * `geo: 'rounded-rect'` does not merely look different there — the app's own
 * Stock check reports it verbatim: "stock tldraw would refuse this record: geo
 * 'rounded-rect' is not a stock value". It fails validation outright.
 *
 * So the radius lives where it degrades instead of breaking: `meta`, which
 * tldraw carries untouched and ignores. The record stays `geo: 'rectangle'`,
 * plain tldraw opens the board and draws square corners, and only THIS app
 * swaps in the rounded path — on the shape object handed to the painter, never
 * on the one in the store.
 *
 * WHY a subclass rather than `customGeoTypes: { rectangle: ... }`: tldraw
 * rejects that outright — GeoShapeUtil.mjs warns "customGeoTypes key
 * 'rectangle' collides with a built-in geo type and will be ignored". These
 * four methods are the complete set that resolve a geo shape to a path
 * (getGeometry, component, getIndicatorPath, toSvg), so swapping the geo for
 * all four keeps geometry, hit-testing, the selection indicator and SVG export
 * agreeing with each other. The custom type stays registered because it owns
 * the path; it just never reaches a record any more.
 */
class RoundedRectPaintGeoShapeUtil extends ConfiguredGeoShapeUtil {
	/** The shape as PAINTED — never the shape as stored. */
	private forPaint(shape: TLGeoShape): TLGeoShape {
		const radius = readPrimitiveOverride(shape).cornerRadius ?? 0
		if (radius <= 0 || shape.props.geo !== 'rectangle') return shape
		return { ...shape, props: { ...shape.props, geo: ROUNDED_RECT_GEO as TLGeoShape['props']['geo'] } }
	}

	override getGeometry(shape: TLGeoShape) { return super.getGeometry(this.forPaint(shape)) }
	override component(shape: TLGeoShape) { return super.component(this.forPaint(shape)) }
	override getIndicatorPath(shape: TLGeoShape) { return super.getIndicatorPath(this.forPaint(shape)) }
	override toSvg(shape: TLGeoShape, ctx: SvgExportContext) { return super.toSvg(this.forPaint(shape), ctx) }
}

const ConfiguredArrowShapeUtil = ArrowShapeUtil.configure({
	// WHY a resolvedFill arg here, added alongside the census sweep: the
	// `fillColor` paint row already applied to arrows (HAS_FILL sees their
	// `fill` prop) and wrote real meta, but nothing here ever read it back —
	// arrowOverrideDisplayValues never returned a `fillColor` key, so the
	// merge in `getDisplayValues` always fell through to the untouched stock
	// default. A real "control that does nothing" bug, not a new field: fixed
	// the same way geo's fillOpacity-with-no-fillColor case already is.
	getCustomDisplayValues: (_editor, shape, theme, colorMode) =>
		arrowOverrideDisplayValues(shape, defaultFillColorFor(shape.props, theme.colors[colorMode])),
})

const ConfiguredTextShapeUtil = TextShapeUtil.configure({
	getCustomDisplayValues: (_editor, shape) => textOverrideDisplayValues(shape),
})

const ConfiguredLineShapeUtil = LineShapeUtil.configure({
	getCustomDisplayValues: (_editor, shape) => lineOverrideDisplayValues(shape),
})

const ConfiguredDrawShapeUtil = DrawShapeUtil.configure({
	getCustomDisplayValues: (_editor, shape) => drawOverrideDisplayValues(shape),
})

const ConfiguredNoteShapeUtil = NoteShapeUtil.configure({
	getCustomDisplayValues: (_editor, shape) => noteOverrideDisplayValues(shape),
})

const ConfiguredHighlightShapeUtil = HighlightShapeUtil.configure({
	getCustomDisplayValues: (_editor, shape) => highlightOverrideDisplayValues(shape),
})

// WHY this one carries no `getCustomDisplayValues` at all: a frame's colour
// paint is not a `meta` override — it is the stock `showColorsFillColor`/
// `showColorsHeadingFillColor`/etc. display values, which tldraw already
// computes from `shape.props.color` once it knows to look. `showColors:
// false` is the actual default (`FrameShapeUtil.tsx`'s own options), and it
// stays the default here unless `FRAME_COLORS_ENABLED` (above) opts in —
// turned on, `props.color` (present in every frame record already, per
// `TLFrameShape.ts`'s migration, but registered only as a plain validator,
// not a real StyleProp) becomes a genuine `DefaultColorStyle` StyleProp, so
// `editor.styleProps.frame` starts carrying it and the frame's own colour
// paints instead of the hard-coded black default. See `inspectorModel.ts`'s
// `styleReaches` and `frameShowColorsOn` — the seams the Colour row checks
// before offering itself on a frame, so a plain load (switch off) keeps
// withholding it honestly instead of writing a prop that changes nothing.
const ConfiguredFrameShapeUtil = FrameShapeUtil.configure({ showColors: FRAME_COLORS_ENABLED })

// WHY `withPrimitiveOverrides` on geo/arrow/text/note but not line/draw/highlight:
// it wraps `component()` to switch off tldraw's label halo (`textOutline`), and
// only shapes that can carry a label have one to switch off — ported unchanged
// from the donor's own grouping in stockPrimitiveVisuals.ts/excalidrawInterop.ts/
// systemSketchArrow.tsx.
const REPLACED_TYPES = new Set(['geo', 'arrow', 'text', 'line', 'draw', 'note', 'highlight', 'frame'])

/**
 * The seven stock utils this lab configures, plus every other stock util
 * (frame, image, video, bookmark, embed, group, …) untouched — so the app
 * still opens and paints every shape type plain tldraw does, and only the
 * seven with a `paint` row in `inspectorModel.ts` gain the seam.
 */
export const CONFIGURED_SHAPE_UTILS: TLAnyShapeUtilConstructor[] = [
	...[
		withPrimitiveOverrides(RoundedRectPaintGeoShapeUtil),
		withPrimitiveOverrides(ConfiguredArrowShapeUtil),
		withPrimitiveOverrides(ConfiguredTextShapeUtil),
		ConfiguredLineShapeUtil,
		ConfiguredDrawShapeUtil,
		withPrimitiveOverrides(ConfiguredNoteShapeUtil),
		ConfiguredHighlightShapeUtil,
	].map(markResolvesPrimitiveOverrides) as TLAnyShapeUtilConstructor[],
	// Not branded with `markResolvesPrimitiveOverrides`: frame carries no
	// `meta` override at all, `paintReaches` is not what gates its Colour row,
	// and `withPrimitiveOverrides` has nothing to wrap (no label halo either —
	// a frame's own name is not a `richText` label).
	ConfiguredFrameShapeUtil as unknown as TLAnyShapeUtilConstructor,
	...defaultShapeUtils.filter((util) => !REPLACED_TYPES.has(util.type)),
]
