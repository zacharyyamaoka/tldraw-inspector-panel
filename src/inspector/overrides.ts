/**
 * The granular paint a stock tldraw shape can wear, and where each value lands.
 *
 * tldraw's own style bar exposes a deliberately small vocabulary: a palette of
 * 12 named colours, four size rungs, four fills, four dashes. Underneath it the
 * engine resolves every one of those into a *display value* — a real CSS colour,
 * a real pixel width, a real font size — through the public
 * `getCustomDisplayValues` seam on each ShapeUtil. That seam accepts arbitrary
 * values. Nothing about "stock tldraw" restricts a rectangle to 12 colours; the
 * restriction is in the picker, not the renderer.
 *
 * This is the record of the ones the inspector may set, kept in `meta` so the
 * shape stays an ordinary `geo`/`text`/`arrow`/`note` record that plain tldraw
 * still opens — the same contract `stockPrimitiveVisuals.ts` protects.
 *
 * ONE EXCEPTION, and it is deliberate: {@link cornerRadius} is not paint. It
 * switches the shape onto a geometry registered through tldraw's own
 * `customGeoTypes` seam, so `props.geo` holds a value plain tldraw does not
 * know. That is disclosed on the field itself and lowered back to a stock
 * `oval`/`rectangle` by `portableTldraw.ts` on export. Everything else on this
 * list leaves the record byte-for-byte stock.
 *
 * WHY meta rather than new props: a StyleProp added to a stock shape changes
 * that record's on-disk schema, and a `.tldr` written here would stop opening in
 * plain tldraw. `meta` is tldraw's sanctioned escape hatch and it is what the
 * display seam is designed to read. A board that loses this app keeps every
 * shape, at the engine's own default paint.
 *
 * The one value here that is not a display value is {@link textOutline}. tldraw
 * paints a ~2px halo in the canvas background colour behind every shape label
 * (`--tl-text-outline` in `tldraw.css`, used by `.tl-text__outline`) so text
 * stays legible over a line running under it. On a white canvas that halo reads
 * as a white smear around the glyphs, there is no stock control for it, and the
 * engine already made it a CSS custom property — so turning it off is one
 * inherited variable, set by a wrapper the same way `withAsyncEdge` sets its own.
 */
import { createElement, type CSSProperties } from 'react'

// WHY the literal value stays `'systemSketchPrimitiveOverride'`, not something
// named for this lab: this file is ported verbatim from SystemSketch
// (77907974) on purpose — the same key means a board saved from either app's
// inspector round-trips through the other with its overrides intact. Renaming
// the value would silently orphan every override on a board opened by the
// other app; the constant's own *name* can drift, the string it holds cannot.
export const SYSTEMSKETCH_PRIMITIVE_OVERRIDE_META_KEY = 'systemSketchPrimitiveOverride'

/**
 * Every field is optional and absent means "leave tldraw's own answer alone".
 * An emptied record drops the meta key entirely, so a shape that has been
 * reset is byte-identical to one that was never touched.
 */
export interface PrimitiveOverride {
	/** Any CSS colour for the outline — not just the 12 named ones. */
	strokeColor?: string
	/** Exact outline width in scene px, independent of the `size` rung. */
	strokeWidth?: number
	/** Corner rounding of the drawn outline, in scene px. tldraw derives this
	 *  as `strokeWidth * 2` and never exposes it. */
	strokeRoundness?: number
	/** True corner radius, in scene px, for the app's rounded-rectangle
	 *  geometry — the one thing on this list that changes the path rather than
	 *  the paint, which is why it is a registered `customGeoTypes` entry rather
	 *  than a display value. */
	cornerRadius?: number
	/** Any CSS colour for the interior, including `rgba(...)` and `transparent`. */
	fillColor?: string
	/** 0–1 alpha composited onto whatever colour the fill resolves to. */
	fillOpacity?: number
	/** Any CSS colour for the label ink. */
	labelColor?: string
	/** Any CSS font stack. tldraw's picker offers four named families. */
	labelFontFamily?: string
	/** Exact label size in scene px, off the four-rung ladder. */
	labelFontSize?: number
	/** A real CSS weight: tldraw hard-codes one for every shape. */
	labelFontWeight?: string
	/** `italic`, which no stock control offers. */
	labelFontStyle?: string
	/** Line height as a ratio of the font size. */
	labelLineHeight?: number
	/** Padding between the label and the shape's edge, in scene px. */
	labelPadding?: number
	/** False turns off the white `--tl-text-outline` halo behind the label. */
	textOutline?: boolean
	/** Sticky note geometry — tldraw hard-codes 200×200. */
	noteWidth?: number
	noteHeight?: number
	/** The note's ring. Width 0 removes it. */
	noteBorderWidth?: number
	noteBorderColor?: string
	/** The rounded plate behind an arrow's label. */
	arrowLabelRadius?: number
	/** A highlighter's two passes, which the stock UI fixes at 0.82 / 0.35. */
	highlightUnderlayOpacity?: number
	highlightOverlayOpacity?: number
	/** The flat colour geo/draw/arrow paint instead of the diagonal pattern once
	 *  zoomed far enough out that the lines would alias into noise (tldraw's own
	 *  `PatternFill`, effective zoom <= 0.18). Only visible with `fill: 'pattern'`. */
	patternFillFallbackColor?: string
	/** A geo label's minimum width before it starts wrapping harder than the
	 *  shape's own size rung would otherwise force. geo only. */
	labelMinWidth?: number
	/** Margin between a geo label's own edge and the shape's edge, in scene px.
	 *  geo only; tldraw hard-codes 8. */
	labelEdgeMargin?: number
}

/** The numeric fields, so a reader can validate them in one place. */
const NUMERIC_FIELDS = [
	'strokeWidth',
	'strokeRoundness',
	'cornerRadius',
	'fillOpacity',
	'labelFontSize',
	'labelLineHeight',
	'labelPadding',
	'noteWidth',
	'noteHeight',
	'noteBorderWidth',
	'arrowLabelRadius',
	'highlightUnderlayOpacity',
	'highlightOverlayOpacity',
	'labelMinWidth',
	'labelEdgeMargin',
] as const

const STRING_FIELDS = [
	'strokeColor',
	'fillColor',
	'labelColor',
	'labelFontFamily',
	'labelFontWeight',
	'labelFontStyle',
	'noteBorderColor',
	'patternFillFallbackColor',
] as const

export type PrimitiveOverrideField = keyof PrimitiveOverride

/** The minimum a reader needs; a unit test fixture satisfies it without records. */
export interface OverridableShape {
	meta?: Record<string, unknown>
	props?: object
	type?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

/**
 * The overrides a shape carries, or an empty record.
 *
 * Deliberately defensive: this reads a `meta` bag that a hand-edited file, an
 * older release, or another tool may have written, so a value of the wrong
 * shape is dropped rather than handed to the renderer.
 */
export function readPrimitiveOverride(shape: OverridableShape): PrimitiveOverride {
	const value = shape.meta?.[SYSTEMSKETCH_PRIMITIVE_OVERRIDE_META_KEY]
	if (!isRecord(value)) return {}
	const next: PrimitiveOverride = {}
	for (const field of NUMERIC_FIELDS) {
		const raw = value[field]
		if (typeof raw === 'number' && Number.isFinite(raw)) next[field] = raw
	}
	for (const field of STRING_FIELDS) {
		const raw = value[field]
		if (typeof raw === 'string' && raw.length > 0) next[field] = raw
	}
	if (typeof value.textOutline === 'boolean') next.textOutline = value.textOutline
	return next
}

/**
 * The shape's metadata with one override changed. `undefined` clears the field,
 * and clearing the last one clears the whole record.
 *
 * WHY the emptied key is written as `null` rather than deleted: tldraw's
 * `updateShapes` does not replace `meta`, it merges it key by key
 * (`applyPartialToRecordWithProps` in `Editor.ts` — `next.meta[k] = v` for each
 * entry of the partial). A key left out of the object is therefore a key left
 * *untouched*, so `delete` here would look correct, pass a unit test against a
 * replacing fixture, and silently do nothing in the app. `null` is the repo's
 * existing answer to the same trap — see `metaWithoutSlantedArrow` in
 * `systemSketchArrow.tsx` — and every reader below already treats it as absent.
 */
export function writePrimitiveOverride(
	shape: OverridableShape,
	patch: Partial<Record<PrimitiveOverrideField, string | number | boolean | undefined>>,
): Record<string, unknown> {
	const next: Record<string, unknown> = { ...readPrimitiveOverride(shape) }
	for (const [field, value] of Object.entries(patch)) {
		if (value === undefined) delete next[field]
		else next[field] = value
	}
	const meta = { ...(shape.meta ?? {}) }
	// The nested record IS replaced wholesale by the merge above, so removing a
	// field inside it works; only the top-level key needs the null.
	meta[SYSTEMSKETCH_PRIMITIVE_OVERRIDE_META_KEY] = Object.keys(next).length === 0 ? null : next
	return meta
}

/** Every override cleared at once — the panel's Reset. */
export function clearPrimitiveOverride(shape: OverridableShape): Record<string, unknown> {
	return { ...(shape.meta ?? {}), [SYSTEMSKETCH_PRIMITIVE_OVERRIDE_META_KEY]: null }
}

export function hasPrimitiveOverride(shape: OverridableShape): boolean {
	return Object.keys(readPrimitiveOverride(shape)).length > 0
}

/**
 * A shape's `scale`, which tldraw multiplies most display values by.
 *
 * WHY it matters here: the inspector's numbers are the ones a person reads off
 * the canvas, so a width typed as 6 has to stay 6 on screen after the shape's
 * text size moves `scale` (`customFontSize.ts` does exactly that). Dividing on
 * the way into the display value is what makes that true — the same correction
 * `strokeWidthDisplayValue` documents.
 */
function scaleOf(shape: OverridableShape): number {
	const scale = (shape.props as Record<string, unknown> | undefined)?.scale
	return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1
}

function unscaled(value: number | undefined, shape: OverridableShape): number | undefined {
	return value === undefined ? undefined : value / scaleOf(shape)
}

/** Drop the keys whose value is `undefined` so a spread never blanks a default. */
function defined<T extends object>(values: T): Partial<T> {
	const next: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(values)) {
		if (value !== undefined) next[key] = value
	}
	return next as Partial<T>
}

/**
 * Composite `fillColor` over `fillOpacity`.
 *
 * The alpha is applied to whatever colour is in force — the override if there
 * is one, otherwise nothing, because the engine's own resolved fill is not
 * visible from here and a `color-mix` against an unknown value would be a lie.
 * A fill alpha with no fill colour therefore paints the shape's own palette
 * colour at that alpha via `color-mix`, which resolves in the browser against
 * whatever `currentColor`-independent literal we pass it.
 */
function fillPaint(
	override: PrimitiveOverride,
	resolvedFill: string | undefined,
): string | undefined {
	const base = override.fillColor ?? resolvedFill
	if (base === undefined) return undefined
	if (override.fillOpacity === undefined) return override.fillColor
	const percent = Math.round(Math.min(1, Math.max(0, override.fillOpacity)) * 100)
	return `color-mix(in srgb, ${base} ${percent}%, transparent)`
}

/**
 * The display values for a `geo` shape: the widest surface, since a rectangle
 * carries an outline, an interior and a label all at once.
 *
 * `resolvedFill` is the colour the caller already computed for this shape, so
 * an alpha can be applied to the app's own fill paint rather than replacing it.
 */
export function geoOverrideDisplayValues(
	shape: OverridableShape,
	resolvedFill?: string,
): Record<string, unknown> {
	const override = readPrimitiveOverride(shape)
	const width = unscaled(override.strokeWidth, shape)
	// Roundness rides with the width because tldraw defines it as `strokeWidth
	// * 2`; left behind, a `draw`-dashed outline rounds its corners for a width
	// it is no longer drawn at.
	const roundness = unscaled(override.strokeRoundness, shape) ?? (width === undefined ? undefined : width * 2)
	return defined({
		strokeColor: override.strokeColor,
		strokeWidth: width,
		strokeRoundness: roundness,
		fillColor: fillPaint(override, resolvedFill),
		patternFillFallbackColor: override.patternFillFallbackColor,
		labelColor: override.labelColor,
		labelFontFamily: override.labelFontFamily,
		labelFontSize: unscaled(override.labelFontSize, shape),
		labelFontWeight: override.labelFontWeight,
		labelFontStyle: override.labelFontStyle,
		labelLineHeight: override.labelLineHeight,
		labelPadding: unscaled(override.labelPadding, shape),
		labelMinWidth: unscaled(override.labelMinWidth, shape),
		labelEdgeMargin: unscaled(override.labelEdgeMargin, shape),
	})
}

/** A text shape names its ink `color` and its face `fontFamily`. */
export function textOverrideDisplayValues(shape: OverridableShape): Record<string, unknown> {
	const override = readPrimitiveOverride(shape)
	return defined({
		color: override.labelColor,
		fontFamily: override.labelFontFamily,
		fontSize: unscaled(override.labelFontSize, shape),
		fontWeight: override.labelFontWeight,
		fontStyle: override.labelFontStyle,
		lineHeight: override.labelLineHeight,
	})
}

/** A line has only an outline. */
export function lineOverrideDisplayValues(shape: OverridableShape): Record<string, unknown> {
	const override = readPrimitiveOverride(shape)
	return defined({
		strokeColor: override.strokeColor,
		strokeWidth: unscaled(override.strokeWidth, shape),
	})
}

/** A freehand stroke: outline plus the fill a closed stroke takes. */
export function drawOverrideDisplayValues(
	shape: OverridableShape,
	resolvedFill?: string,
): Record<string, unknown> {
	const override = readPrimitiveOverride(shape)
	return defined({
		strokeColor: override.strokeColor,
		strokeWidth: unscaled(override.strokeWidth, shape),
		fillColor: fillPaint(override, resolvedFill),
		patternFillFallbackColor: override.patternFillFallbackColor,
	})
}

/**
 * An arrow adds the rounded plate its label sits on.
 *
 * `resolvedFill` is the shape's own stock fill (see `configuredUtils.ts`'s
 * `defaultFillColorFor`), so a `fillOpacity`-only override — no `fillColor`
 * set — composites onto what the arrow would already be painting, the same
 * correction `geoOverrideDisplayValues` needed.
 */
export function arrowOverrideDisplayValues(
	shape: OverridableShape,
	resolvedFill?: string,
): Record<string, unknown> {
	const override = readPrimitiveOverride(shape)
	return defined({
		strokeColor: override.strokeColor,
		strokeWidth: unscaled(override.strokeWidth, shape),
		fillColor: fillPaint(override, resolvedFill),
		patternFillFallbackColor: override.patternFillFallbackColor,
		labelColor: override.labelColor,
		labelFontFamily: override.labelFontFamily,
		labelFontSize: unscaled(override.labelFontSize, shape),
		labelLineHeight: override.labelLineHeight,
		labelPadding: unscaled(override.labelPadding, shape),
		labelBorderRadius: override.arrowLabelRadius,
	})
}

/**
 * A sticky note's plate and ink.
 *
 * `resolvedFill` is the colour tldraw would paint the plate — `noteFill` for the
 * shape's palette colour — so a fill ALPHA composites onto it. Without it the
 * Fill alpha row wrote meta and left the sticky exactly as opaque as before.
 */
export function noteOverrideDisplayValues(
	shape: OverridableShape,
	resolvedFill?: string,
): Record<string, unknown> {
	const override = readPrimitiveOverride(shape)
	return defined({
		noteWidth: override.noteWidth,
		noteHeight: override.noteHeight,
		noteBackgroundColor: fillPaint(override, resolvedFill) ?? override.fillColor,
		borderColor: override.noteBorderColor,
		borderWidth: unscaled(override.noteBorderWidth, shape),
		labelColor: override.labelColor,
		labelFontFamily: override.labelFontFamily,
		labelFontSize: unscaled(override.labelFontSize, shape),
		labelFontWeight: override.labelFontWeight,
		labelFontStyle: override.labelFontStyle,
		labelLineHeight: override.labelLineHeight,
		labelPadding: unscaled(override.labelPadding, shape),
	})
}

/** The highlighter's two passes, the only shape that names its own opacities. */
export function highlightOverrideDisplayValues(shape: OverridableShape): Record<string, unknown> {
	const override = readPrimitiveOverride(shape)
	return defined({
		strokeColor: override.strokeColor,
		strokeWidth: unscaled(override.strokeWidth, shape),
		underlayOpacity: override.highlightUnderlayOpacity,
		overlayOpacity: override.highlightOverlayOpacity,
	})
}

/** The class the halo wrapper carries, so a journey can find it in the DOM. */
export const PRIMITIVE_OVERRIDE_CLASS = 'systemsketch-primitive-override'

/**
 * The CSS custom properties a shape's overrides contribute to its own subtree,
 * or `null` when it contributes none.
 *
 * Only the text halo lives here. Everything else is a display value, and a
 * display value is strictly better: it reaches the SVG export, the thumbnail
 * and the print path, which a stylesheet variable does not.
 */
export function primitiveOverrideStyle(shape: OverridableShape): CSSProperties | null {
	const override = readPrimitiveOverride(shape)
	if (override.textOutline !== false) return null
	return { display: 'contents', '--tl-text-outline': 'none' } as CSSProperties
}

/* eslint-disable @typescript-eslint/no-explicit-any -- a mixin over tldraw's
   ShapeUtil generics: each util narrows `component` to its own shape type, and
   the wrapper deliberately does not care which one it has. */
type UtilConstructor = new (...args: any[]) => {
	component(shape: any): any
}

/**
 * Wrap a stock ShapeUtil so a shape that switched its label halo off renders
 * without it. Every other shape is returned exactly as the base drew it, and
 * the wrapper element is `display: contents`, so it adds no box of its own.
 */
export function withPrimitiveOverrides<T extends UtilConstructor>(Base: T): T {
	return markResolvesPrimitiveOverrides(class PrimitiveOverrideShapeUtil extends Base {
		override component(shape: OverridableShape) {
			const rendered = super.component(shape)
			const style = primitiveOverrideStyle(shape)
			if (!style) return rendered
			return createElement('div', { className: PRIMITIVE_OVERRIDE_CLASS, style }, rendered)
		}
	}) as unknown as T
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The brand that says "this ShapeUtil resolves the inspector's `meta` overrides
 * into real paint".
 *
 * WHY the inspector needs to ask: the `paint` rows (Fill alpha, exact stroke,
 * typeface, the halo toggle, …) only do anything because `stockPrimitiveVisuals`
 * and `excalidrawInterop` configure the stock utils to read the functions above
 * through tldraw's `getCustomDisplayValues` seam. The `?stock-inspector` route
 * mounts a *bare* `<Tldraw />` with none of that, so `GeoShapeUtil` there resolves
 * nothing — a paint row on that route would write `meta`, light its overridden
 * dot, and change no pixels, which is exactly the "a control that does nothing is
 * a lie" failure that route exists to disprove. The model gates every paint row
 * on {@link shapePaintResolvesOverrides} so the two routes stay one field list
 * with one predicate rather than diverging.
 */
const PRIMITIVE_PAINT_SEAM_FLAG = 'systemSketchResolvesPrimitiveOverrides'

/* eslint-disable @typescript-eslint/no-explicit-any -- brands a ShapeUtil class,
   whichever concrete generic it was configured with. */
/**
 * Mark a configured ShapeUtil (class or already-constructed subclass) as one
 * that resolves inspector paint overrides. The flag is a static property, so
 * every `withAsyncEdge` / `withPrimitiveOverrides` wrapper layered on top
 * inherits it. Idempotent; safe to call on the same class twice.
 */
export function markResolvesPrimitiveOverrides<T>(Util: T): T {
	Object.defineProperty(Util, PRIMITIVE_PAINT_SEAM_FLAG, {
		value: true,
		configurable: true,
	})
	return Util
}

/**
 * Does the util that paints this shape actually resolve the inspector's `meta`
 * overrides? Accepts a `ShapeUtil` instance (`editor.getShapeUtil(shape)`); the
 * brand is read off its constructor chain, or off the instance itself so a unit
 * fixture can stand in for a real util without a class.
 */
export function shapePaintResolvesOverrides(util: unknown): boolean {
	if (!util || (typeof util !== 'object' && typeof util !== 'function')) return false
	if ((util as Record<string, unknown>)[PRIMITIVE_PAINT_SEAM_FLAG] === true) return true
	const ctor = (util as { constructor?: unknown }).constructor as
		| Record<string, unknown>
		| undefined
	return ctor?.[PRIMITIVE_PAINT_SEAM_FLAG] === true
}
/* eslint-enable @typescript-eslint/no-explicit-any */
