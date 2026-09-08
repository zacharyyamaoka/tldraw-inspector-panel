/**
 * Everything a stock tldraw primitive can be told, as one list of fields.
 *
 * The panel that renders this is deliberately dumb: it knows how to draw a row
 * of swatches, a segmented control, a slider, a number, a toggle and a colour
 * well, and nothing at all about tldraw. Every question of *what a rectangle
 * can be* is answered here, once, so the answer stays testable without a DOM
 * and so adding a control is one entry rather than a component.
 *
 * Three provenances, and the panel labels each one, because the difference is
 * the whole point of the surface:
 *
 * - `style` — a tldraw StyleProp. Written to the shapes the row was showing
 *   (never `setStyleForSelectedShapes`, which reads the LIVE selection — see
 *   `writeStyle` below) and separately taught to `setStyleForNextShapes`, so
 *   it participates in tldraw's style memory and the next shape drawn inherits
 *   it, exactly as if it had been picked from the stock style bar.
 * - `prop`  — an ordinary shape prop, or a record field like `opacity`. Stock,
 *   persisted, portable, and mostly unreachable from the stock UI.
 * - `paint` — a display-value override in `meta` (`primitiveOverrides.ts`).
 *   The record stays stock and still opens in plain tldraw; only the paint this
 *   app resolves it to moves.
 *
 * WHY the last one exists at all: tldraw's style bar is a curated 12-colour,
 * four-rung vocabulary, but the engine underneath resolves every one of those
 * into a real CSS colour and a real pixel width through a public seam that
 * accepts arbitrary values. "Stock tldraw" is a much larger surface than "what
 * the stock picker offers", and this panel is the difference made visible.
 */
import {
	ArrowShapeArrowheadEndStyle,
	ArrowShapeArrowheadStartStyle,
	ArrowShapeKindStyle,
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultFontStyle,
	DefaultHorizontalAlignStyle,
	DefaultSizeStyle,
	DefaultTextAlignStyle,
	DefaultVerticalAlignStyle,
	GeoShapeGeoStyle,
	LineShapeSplineStyle,
	Vec,
	type EnumStyleProp,
	type Editor,
	type SharedStyle,
	type TLShape,
	type TLShapePartial,
} from 'tldraw'

import {
	clearPrimitiveOverride,
	hasPrimitiveOverride,
	readPrimitiveOverride,
	shapePaintResolvesOverrides,
	writePrimitiveOverride,
	type PrimitiveOverrideField,
} from './overrides'

// WHY inlined rather than imported: the donor (systemsketch@77907974,
// src/contextualMenus/sharedValues.ts) pulls this fold in from a contextual-menu
// module this repo has no reason to bring over wholesale — the fold itself is the
// only piece this file needs. Ported verbatim (module comment included) as one of
// the two sanctioned edits to this port; see docs/log.md's M2 entry.
/**
 * THE one reduce for "do these agree?".
 *
 * WHY: every contextual surface needs "is this property the same across every
 * relevant subject, or mixed" — and each surface used to hand-roll its own
 * fold (`combineShared` in appearanceModel, `sharedEdgeValue` in strokeMeta,
 * a first+every in the appearance pill's arrow reading, an epsilon-compare in
 * customFontSize). Divergent copies of the same fold are how one menu says
 * mixed while its neighbour claims a value. Surfaces fold raw readings with
 * `sharedValueAcross` and already-folded readings with `combineSharedStyles`;
 * neither is reimplemented at a call site.
 *
 * `undefined` readings mean "this subject has nothing to say" and are skipped
 * rather than counted as disagreement; a set with no opinions folds to
 * `undefined`, never to a fabricated value.
 */
function sharedValueAcross<T>(
	values: Iterable<T | undefined>,
	equals: (a: T, b: T) => boolean = Object.is,
): SharedStyle<T> | undefined {
	let found: T | undefined
	let has = false
	for (const value of values) {
		if (value === undefined) continue
		if (!has) {
			found = value
			has = true
		} else if (!equals(found as T, value)) {
			return { type: 'mixed' }
		}
	}
	return has ? { type: 'shared', value: found as T } : undefined
}

export type InspectorValue = string | number | boolean

export type ControlKind =
	| 'swatches'
	| 'segments'
	| 'tiles'
	| 'number'
	| 'toggle'
	| 'color'
	| 'text'

export type ControlSource = 'style' | 'prop' | 'paint'

export interface InspectorOption {
	value: string
	label: string
	/** A resolved CSS colour, for a swatch row. */
	swatch?: string
	/** A short SVG path drawn for a tile grid. */
	path?: string
	/** That path's own box, when it is not the default `0 0 24 24`. */
	viewBox?: string
}

export interface InspectorControl {
	id: string
	label: string
	kind: ControlKind
	source: ControlSource
	/**
	 * The small muted caption this row sits under, Figma's second level:
	 * `Position`, `Dimensions`, `Alignment`. Consecutive controls sharing one
	 * are drawn under a single caption.
	 */
	caption?: string
	/**
	 * True when the row is half of a two-up pair (X/Y, W/H). The panel packs
	 * these into one 2-column grid instead of giving each a full-width gutter,
	 * which is what stops a 280px column from truncating every label.
	 */
	paired?: boolean
	/** The one or two characters printed inside the field, ahead of the value. */
	glyph?: string
	/**
	 * Where a scrub starts on a row that is still `auto` — tldraw's own value
	 * for it. Without this the drag begins at the field's minimum, so the first
	 * gesture on an untouched Fill alpha jumps the shape to fully transparent
	 * instead of easing away from opaque. It is a gesture origin only; the row
	 * still reads `auto` until something is written.
	 */
	fallback?: number
	/** `null` means the selection disagrees — tldraw's own "mixed". */
	value: InspectorValue | null
	options?: InspectorOption[]
	min?: number
	max?: number
	step?: number
	unit?: string
	hint?: string
	/** True when this row is currently holding a `paint` override, so the panel
	 *  can offer to put it back to whatever tldraw would have done. */
	overridden?: boolean
	/**
	 * True when no selected shape has an opinion yet, which is the resting
	 * state of every override row and is NOT the same as `Mixed`. The row is
	 * still drawn, because an unset override row is the only way to set one;
	 * the panel shows it as `auto` rather than inventing a number tldraw is
	 * not actually painting with.
	 */
	unset?: boolean
	/** True when the engine derives this value and nothing here can change
	 *  it — `growY`, so far. Still drawn (never dropped): the whole point is
	 *  showing the number tldraw computed, which a hidden row cannot. */
	disabled?: boolean
}

export interface InspectorGroup {
	id: string
	label: string
	controls: InspectorControl[]
}

export interface PrimitiveInspectorModel {
	count: number
	/** The shapes this reading describes, so a blur-committed field edits the
	 *  shapes it was showing rather than whatever is selected by then. */
	shapeIds: string[]
	/** `rectangle`, `arrow`, `3 geos` — the stock token, never an internal id. */
	title: string
	/** The stock record types in the selection, for the subtitle. */
	types: string[]
	groups: InspectorGroup[]
	locked: boolean
	/** True when anything in the selection carries a paint override. */
	hasOverrides: boolean
}

/* ------------------------------------------------------------------ helpers */

function propOf(shape: TLShape, key: string): unknown {
	return (shape.props as Record<string, unknown> | undefined)?.[key]
}

function hasProp(shape: TLShape, key: string): boolean {
	return propOf(shape, key) !== undefined
}

/**
 * A shape whose util locks its aspect ratio resizes through `resizeScaled`,
 * which moves `props.scale` and never touches `props.w`/`props.h`.
 *
 * WHY that makes the row unofferable rather than merely imprecise: the field
 * reads `props.w`, so it displayed 8 no matter what was typed — while each
 * attempt multiplied `scale` by the ratio. Typing 200 into a text shape's W
 * grew it 25x, and typing it again grew it 625x. A row that silently does
 * something destructive and reports nothing is the worst case of the lie this
 * file's `applies` rule exists to prevent.
 */
function resizesItsOwnBox(shape: TLShape, editor: Editor): boolean {
	try {
		return editor.getShapeUtil(shape).isAspectRatioLocked(shape) !== true
	} catch {
		return true
	}
}

/**
 * Does the util painting this shape resolve the inspector's `meta` overrides
 * into real paint?
 *
 * WHY every `paint` row is gated on it: the overrides only reach pixels because
 * `stockPrimitiveVisuals` / `excalidrawInterop` configure the stock utils to
 * read them through `getCustomDisplayValues`. The `?stock-inspector` route
 * mounts a bare `<Tldraw />` with none of that, so there a paint row would write
 * `meta`, light its overridden dot and move nothing — the "a control that does
 * nothing is a lie" failure that route exists to disprove. One predicate, both
 * routes: the in-app dock and the stock board draw the same field list, and the
 * paint rows simply drop out where the seam is not installed.
 *
 * The panel is honest about the engine it is standing on.
 */
function paintReaches(shape: TLShape, editor: Editor): boolean {
	try {
		return shapePaintResolvesOverrides(editor.getShapeUtil(shape))
	} catch {
		return false
	}
}

/**
 * Does THIS app's configuration actually register `style` as a StyleProp for
 * `shape`'s type?
 *
 * WHY a frame needs this and `hasProp` is not enough: `props.color` exists on
 * every frame record unconditionally (`TLFrameShape.ts`'s own migration
 * defaults it to `'black'`), but tldraw registers it as a plain validator, not
 * a real `DefaultColorStyle` StyleProp, unless `FrameShapeUtil.configure({
 * showColors: true })` has run — "because shape colors are an option, we
 * don't want them to be picked up by the editor as a style prop by default"
 * (tlschema's own comment). `editor.styleProps[type]` is the engine's own
 * record of which props are wired that way; reading it, rather than hard-
 * coding "not on a frame" the way this row used to, is what lets the stock
 * route (no configure call — see `configuredUtils.ts`) keep withholding the
 * row honestly instead of writing a prop that changes nothing, the same
 * shape of gate `paintReaches` already is for the `meta` seam.
 */
function styleReaches(shape: TLShape, editor: Editor, style: EnumStyleProp<string>): boolean {
	try {
		return editor.styleProps[shape.type]?.has(style) ?? false
	} catch {
		return false
	}
}

/**
 * Frame only: is `showColors` actually on for the util painting this shape,
 * asked directly rather than inferred.
 *
 * WHY on top of `styleReaches` rather than instead of it: `styleReaches`
 * already answers this correctly today, because `FrameShapeUtil.configure`
 * only promotes `props.color` to a real `DefaultColorStyle` StyleProp when
 * `showColors` was true at configure time — but that is a one-hop inference
 * from a side effect of configuration, not the question itself. `?frames=colors`
 * (`configuredUtils.ts`) makes `showColors` a runtime-decided default-off
 * switch, and `tests/compat_smoke.mjs` measuring 83 changed px on a pure-
 * record board — a frame painting its own colour when nothing asked it to —
 * is exactly the "control that does nothing is a lie" failure this file's
 * own rule exists to prevent, just inverted: a row silently changing paint
 * with no visible control for it. Reading `util.options.showColors` directly
 * is the belt to `styleReaches`'s suspenders.
 */
function frameShowColorsOn(shape: TLShape, editor: Editor): boolean {
	if (shape.type !== 'frame') return false
	try {
		const util = editor.getShapeUtil(shape) as unknown as { options?: { showColors?: boolean } }
		return util.options?.showColors === true
	} catch {
		return false
	}
}

/** The app's rounded rectangle, registered through tldraw's `customGeoTypes`. */
const ROUNDED_RECT_GEO = 'systemsketch-rounded-rect'

/** tldraw's own twenty, in the order the schema declares them. */
const STOCK_GEO_VALUES = [
	'rectangle', 'ellipse', 'oval', 'triangle', 'diamond', 'pentagon', 'hexagon',
	'octagon', 'star', 'rhombus', 'rhombus-2', 'trapezoid', 'cloud', 'heart',
	'x-box', 'check-box', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down',
]

/**
 * One cast, in one place.
 *
 * `updateShapes` is discriminated on `type`, and every write here is over a
 * heterogeneous selection whose `type` is the broad union — so each call site
 * would otherwise need its own assertion. Narrowing happens where it belongs
 * instead: a field's `applies` predicate is what guarantees the shape carries
 * the prop being written.
 */
function updateShapes(
	editor: Editor,
	partials: Array<{ id: TLShape['id']; type: string; [key: string]: unknown }>,
): void {
	editor.updateShapes(partials as unknown as TLShapePartial[])
}

function round(value: number, places = 0): number {
	const factor = 10 ** places
	return Math.round(value * factor) / factor
}

/**
 * The leaf shapes an `opacity` write must actually touch.
 *
 * WHY it expands a group: a group record renders only its selection outline —
 * its children paint themselves — so `opacity` on the group changes nothing a
 * person sees. tldraw's own `setOpacityForSelectedShapes` recurses for exactly
 * this reason; this is that recursion, but over the shapes the row was showing
 * rather than the live selection (which a blur can move — see
 * `applyPrimitiveInspectorControl`). Defensive about a fixture editor that has
 * no group API.
 */
function opacityTargets(editor: Editor, shapes: TLShape[]): TLShape[] {
	const isGroup = (shape: TLShape): boolean =>
		typeof editor.isShapeOfType === 'function' && editor.isShapeOfType(shape, 'group')
	const out: TLShape[] = []
	const walk = (shape: TLShape): void => {
		if (isGroup(shape)) {
			for (const childId of editor.getSortedChildIdsForParent(shape.id)) {
				const child = editor.getShape(childId)
				if (child) walk(child)
			}
		} else {
			out.push(shape)
		}
	}
	for (const shape of shapes) walk(shape)
	return out
}

/** tldraw's palette, resolved through the live theme so a swatch is truthful. */
function paletteOptions(editor: Editor): InspectorOption[] {
	const theme = editor.getCurrentTheme()
	const colors = theme.colors[editor.getColorMode()] as Record<string, { solid?: string }>
	return (DefaultColorStyle as EnumStyleProp<string>).values.map((name) => ({
		value: name,
		label: name,
		swatch: colors?.[name]?.solid,
	}))
}

function enumOptions(style: EnumStyleProp<string>, labels: Record<string, string> = {}): InspectorOption[] {
	return style.values.map((value) => ({ value, label: labels[value] ?? value }))
}

/* ------------------------------------------------------------- field specs */

interface FieldSpec {
	id: string
	label: string
	group: string
	kind: ControlKind
	source: ControlSource
	hint?: string
	min?: number
	max?: number
	step?: number
	unit?: string
	caption?: string
	paired?: boolean
	glyph?: string
	fallback?: number
	/** Engine-derived, read-only — see `InspectorControl.disabled`. */
	disabled?: boolean
	/** Which shapes this row is meaningful for. A row nothing claims is dropped
	 *  rather than shown inert — a control that does nothing is a lie. Some
	 *  answers need the editor (what a shape's util does on resize). */
	applies(shape: TLShape, editor: Editor): boolean
	read(shape: TLShape, editor: Editor): InspectorValue | undefined
	write(editor: Editor, shapes: TLShape[], value: InspectorValue): void
	options?(editor: Editor): InspectorOption[]
	/** The override field this row writes, when it is a `paint` row. */
	overrideField?: PrimitiveOverrideField
}

/**
 * Set a StyleProp, and teach tldraw's style memory the choice.
 *
 * Two writes, because tldraw's own style bar makes the same two calls
 * (`StylePanelContext.onValueChange`): the shapes are updated directly — only
 * the ones `applyPrimitiveInspectorControl` resolved, never `getSelectedShapes()`,
 * which a blur-committed row could have moved off — and `setStyleForNextShapes`
 * records the value so the next shape drawn inherits it. `setStyleForSelectedShapes`
 * does the first job but reads the LIVE selection and does NOT do the second, so
 * neither the shape fence nor the "inherited by the next shape" promise this
 * file's header makes held on it before.
 */
function styleField(
	id: string,
	label: string,
	group: string,
	style: EnumStyleProp<string>,
	prop: string,
	extra: Partial<FieldSpec> & { kind?: ControlKind; labels?: Record<string, string> } = {},
): FieldSpec {
	const { labels, ...rest } = extra
	return {
		id,
		label,
		group,
		kind: 'segments',
		source: 'style',
		applies: (shape) => hasProp(shape, prop),
		read: (shape) => propOf(shape, prop) as string | undefined,
		write: (editor, shapes, value) => {
			writeStyle(editor, shapes, style, prop, String(value))
		},
		options: () => enumOptions(style, labels),
		...rest,
	}
}

/**
 * The two-call style write `styleField` and the Geometry row share.
 *
 * `prop` is the props key — it is what `styleField`'s own `read`/`applies` use,
 * and for every stock shape it equals the StyleProp's key — so the direct
 * `updateShapes` needs no `editor.styleProps` lookup.
 */
function writeStyle(
	editor: Editor,
	shapes: TLShape[],
	style: EnumStyleProp<string>,
	prop: string,
	value: string,
): void {
	updateShapes(editor, shapes.map((shape) => ({
		id: shape.id, type: shape.type, props: { [prop]: value },
	})))
	editor.setStyleForNextShapes(style, value)
}

/** Write an ordinary prop with `updateShapes` — no style memory involved. */
function propField(
	id: string,
	label: string,
	group: string,
	prop: string,
	kind: ControlKind,
	extra: Partial<FieldSpec> = {},
): FieldSpec {
	return {
		id,
		label,
		group,
		kind,
		source: 'prop',
		applies: (shape) => hasProp(shape, prop),
		read: (shape) => propOf(shape, prop) as InspectorValue | undefined,
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({ id: shape.id, type: shape.type, props: { [prop]: value } })),
			)
		},
		...extra,
	}
}

/** Write a display-value override into `meta`. */
function paintField(
	id: string,
	label: string,
	group: string,
	field: PrimitiveOverrideField,
	kind: ControlKind,
	applies: (shape: TLShape) => boolean,
	extra: Partial<FieldSpec> = {},
): FieldSpec {
	return {
		id,
		label,
		group,
		kind,
		source: 'paint',
		overrideField: field,
		// A paint row only appears where the engine will actually resolve the
		// override — never on the bare `?stock-inspector` canvas. See `paintReaches`.
		applies: (shape, editor) => paintReaches(shape, editor) && applies(shape),
		read: (shape) => readPrimitiveOverride(shape)[field] as InspectorValue | undefined,
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
					id: shape.id,
					type: shape.type,
					meta: writePrimitiveOverride(shape, { [field]: value }),
				})),
			)
		},
		...extra,
	}
}

const HAS_OUTLINE = (shape: TLShape) => hasProp(shape, 'dash') || shape.type === 'highlight'
const HAS_FILL = (shape: TLShape) => hasProp(shape, 'fill') || shape.type === 'note'
const HAS_LABEL = (shape: TLShape) => hasProp(shape, 'richText')
/** Only a `text` shape's util reads a weight or a style display value. */
const TEXT_ONLY = (shape: TLShape) => shape.type === 'text'

/**
 * The nine arrowheads, drawn rather than named.
 *
 * tldraw's own picker shows these as icons for a reason: `pipe` and `bar` are
 * not words anyone can distinguish from a list, and `inverted` says nothing at
 * all. The paths are drawn on a shaft entering from the left of a 24×24 box.
 */
const ARROWHEAD_PATHS: Record<string, string> = {
	none: 'M2 12h20',
	arrow: 'M2 12h20M15 6l6 6-6 6',
	triangle: 'M2 12h13M15 6l7 6-7 6z',
	square: 'M2 12h13M15 8h8v8h-8z',
	dot: 'M2 12h11M22 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0z',
	pipe: 'M2 12h18M20 5v14',
	diamond: 'M2 12h11M17.5 6l4.5 6-4.5 6-4.5-6z',
	inverted: 'M2 12h13M22 6l-7 6 7 6z',
	bar: 'M2 12h20M22 6v12',
}

/**
 * The declared surface, in the order the panel draws it.
 *
 * Order is Figma's: the box first (where and how big), then what it is, then
 * fill, then stroke, then type — because that is the order a person edits in,
 * and it puts the two rows that change the silhouette at the top.
 */
const FIELDS: FieldSpec[] = [
	/* ---------------------------------------------------------------- layer */
	/*
	 * WHY position and size read the shape's OWN numbers rather than its page
	 * bounds: the two have to agree, and a page AABB does not survive rotation.
	 * Reading `getShapePageBounds().w` and writing through `resizeShape` — which
	 * scales along the shape's own axis — meant typing 200 into W on a 45°
	 * rectangle committed 141 and redisplayed 171. A field that shows a
	 * different number than the one you typed is the truthful-rendering rule
	 * broken at its most literal.
	 *
	 * Parent-local coordinates are also what Figma shows for a layer inside a
	 * frame, so this is the more familiar reading as well as the consistent one.
	 */
	{
		id: 'x', label: 'X', group: 'layer', kind: 'number', source: 'prop', unit: 'px',
		caption: 'Position', paired: true, glyph: 'x',
		applies: () => true,
		read: (shape) => round(shape.x),
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, x: Number(value),
			})))
		},
	},
	{
		id: 'y', label: 'Y', group: 'layer', kind: 'number', source: 'prop', unit: 'px',
		caption: 'Position', paired: true, glyph: 'y',
		applies: () => true,
		read: (shape) => round(shape.y),
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, y: Number(value),
			})))
		},
	},
	{
		id: 'w', label: 'W', group: 'layer', kind: 'number', source: 'prop', unit: 'px', min: 1,
		caption: 'Dimensions', paired: true, glyph: 'w',
		applies: (shape, editor) => typeof propOf(shape, 'w') === 'number' && resizesItsOwnBox(shape, editor),
		read: (shape) => round(propOf(shape, 'w') as number),
		// Still `resizeShape` rather than a raw prop write: the engine owns
		// resize, so bound arrows, labels and grow-height stay in step. The
		// ratio is now computed from the same number the field displays.
		write: (editor, shapes, value) => {
			for (const shape of shapes) {
				const current = propOf(shape, 'w')
				if (typeof current !== 'number' || current === 0) continue
				editor.resizeShape(shape.id, new Vec(Math.max(1, Number(value)) / current, 1))
			}
		},
	},
	{
		id: 'h', label: 'H', group: 'layer', kind: 'number', source: 'prop', unit: 'px', min: 1,
		caption: 'Dimensions', paired: true, glyph: 'h',
		applies: (shape, editor) => typeof propOf(shape, 'h') === 'number' && resizesItsOwnBox(shape, editor),
		read: (shape) => round(propOf(shape, 'h') as number),
		write: (editor, shapes, value) => {
			for (const shape of shapes) {
				const current = propOf(shape, 'h')
				if (typeof current !== 'number' || current === 0) continue
				editor.resizeShape(shape.id, new Vec(1, Math.max(1, Number(value)) / current))
			}
		},
	},
	{
		id: 'rotation', label: 'Rotate', group: 'layer', kind: 'number', source: 'prop',
		unit: '°', min: -360, max: 360, step: 1,
		caption: 'Rotate', paired: true, glyph: 'angle',
		applies: () => true,
		read: (shape) => round((shape.rotation * 180) / Math.PI, 1),
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, rotation: (Number(value) * Math.PI) / 180,
			})))
		},
	},
	{
		id: 'opacity', label: 'Opacity', group: 'layer', kind: 'number', source: 'prop',
		unit: '%', min: 0, max: 100, step: 1,
		// Its own caption, not a shared one. A lone paired field takes its own
		// label as the caption, so the word "Opacity" is on screen — it was not,
		// and it is the control Zach asked for by name.
		caption: 'Opacity', paired: true, glyph: 'opacity',
		// WHY a slider and not tldraw's five buttons: `opacity` is a plain
		// number on every record and always has been. The stock UI quantises it
		// to 0.1/0.25/0.5/0.75/1 as a taste decision, not a schema one, and a
		// board that needs 0.06 for a background wash has no way to say so.
		hint: 'Stock tldraw stores any 0–1 value; its own picker offers five.',
		applies: () => true,
		read: (shape) => round(shape.opacity * 100),
		// WHY not `setOpacityForSelectedShapes`: it reads the LIVE selection, so a
		// value typed into the box and committed on blur (the click that moved the
		// selection) landed on the newly-selected shape instead of the one the row
		// was showing. The write is fenced to `shapes`, the same as every other row.
		write: (editor, shapes, value) => {
			const opacity = Math.min(1, Math.max(0, Number(value) / 100))
			updateShapes(editor, opacityTargets(editor, shapes).map((shape) => ({
				id: shape.id, type: shape.type, opacity,
			})))
		},
	},
	{
		id: 'isLocked', label: 'Locked', group: 'layer', kind: 'toggle', source: 'prop',
		applies: () => true,
		read: (shape) => shape.isLocked,
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, isLocked: Boolean(value),
			})))
		},
	},
	// M3: an ordinary `url` prop on six record types (geo, note, image,
	// bookmark, embed, video) — the click-through link the stock UI sets
	// through a link icon in the hover toolbar, never through the style
	// panel. One row, `hasProp` alone decides where it applies.
	propField('url', 'Link', 'layer', 'url', 'text', {
		hint: 'The click-through URL. Stock tldraw sets this via the hover toolbar, never a style row.',
	}),
	{
		id: 'growY', label: 'Grown height', group: 'layer', kind: 'number', source: 'prop',
		unit: 'px', disabled: true,
		hint: 'tldraw derives this from the label spilling past the shape’s own height — read-only.',
		applies: (shape) => typeof propOf(shape, 'growY') === 'number',
		read: (shape) => round(propOf(shape, 'growY') as number),
		write: () => {},
	},

	/* ---------------------------------------------------------------- shape */
	styleField('geo', 'Geometry', 'shape', GeoShapeGeoStyle as EnumStyleProp<string>, 'geo', {
		kind: 'tiles',
		hint: 'All 20 stock geometries. Converting an existing shape between them is stock; the toolbar only creates them.',
		// A rounded rectangle reads as `rectangle` in the grid: it IS one, with a
		// radius. Without this the row went blank the moment a radius was set and
		// could not say what the shape's geometry was.
		read: (shape) => {
			const geo = propOf(shape, 'geo')
			return geo === ROUNDED_RECT_GEO || geo === 'excalidraw-rounded-rect'
				? 'rectangle'
				: (geo as string | undefined)
		},
		// `customGeoTypes` calls `GeoShapeGeoStyle.addValues` globally, so this
		// app's two rounded rectangles are in the live enum. They are kept out
		// of the grid because neither is a shape you pick — one is an import
		// artefact carrying Excalidraw's own roundness, and the other is what
		// the Corner radius row below switches a rectangle into.
		options: () => STOCK_GEO_VALUES.map((value) => ({ value, label: value })),
		// Switching geometry drops a corner radius with it. WHY: the radius row
		// only applies to a rectangle, so a leftover `cornerRadius` was invisible
		// on an ellipse and then reappeared — reading 40, wearing its overridden
		// dot and clear button — the moment the shape came back to a rectangle,
		// over a canvas painting hard square corners.
		write: (editor, shapes, value) => {
			const geo = String(value)
			// Same two-call shape as every other style row (see `writeStyle`): edit
			// the shapes this row was showing, and record the choice for the next
			// shape drawn.
			writeStyle(editor, shapes, GeoShapeGeoStyle as EnumStyleProp<string>, 'geo', geo)
			// `read` maps the rounded rectangle back to `rectangle`, so the tile a
			// person clicks to UN-round is `rectangle` — which the old guard
			// skipped, leaving the row reading 40 over hard square corners.
			if (geo === ROUNDED_RECT_GEO) return
			const stale = shapes.filter((shape) => readPrimitiveOverride(shape).cornerRadius !== undefined)
			if (stale.length === 0) return
			updateShapes(editor, stale.map((shape) => ({
				id: shape.id,
				type: shape.type,
				meta: writePrimitiveOverride(shape, { cornerRadius: undefined }),
			})))
		},
	}),
	{
		id: 'cornerRadius', label: 'Corner radius', group: 'shape', kind: 'number', source: 'paint',
		overrideField: 'cornerRadius',
		min: 0, max: 120, step: 1, unit: 'px',
		caption: 'Radius · scale', paired: true, glyph: 'radius',
		// WHY the row swaps the geometry rather than adding a prop: a stock
		// rectangle has no radius, and giving `geo` one would change a stock
		// record's schema. tldraw's answer is `customGeoTypes` — a registered
		// geometry with its own path — and this app already has one. A radius
		// of zero puts the shape back on the plain stock rectangle, so nothing
		// non-stock is left behind by a round trip through the control.
		hint: 'Stock tldraw has no rounded rectangle. This is one, registered through the engine’s own customGeoTypes seam.',
		// `paintReaches` also gates the `customGeoTypes` geometry this row switches
		// into: the same configured GeoShapeUtil registers it, so on the bare stock
		// canvas there is no rounded rectangle to switch to.
		applies: (shape, editor) => paintReaches(shape, editor)
			&& shape.type === 'geo'
			&& (propOf(shape, 'geo') === 'rectangle' || propOf(shape, 'geo') === ROUNDED_RECT_GEO),
		read: (shape) => readPrimitiveOverride(shape).cornerRadius ?? 0,
		write: (editor, shapes, value) => {
			const radius = Math.max(0, Number(value))
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id,
				type: shape.type,
				props: { geo: radius > 0 ? ROUNDED_RECT_GEO : 'rectangle' },
				meta: writePrimitiveOverride(shape, { cornerRadius: radius > 0 ? radius : undefined }),
			})))
		},
	},
	{
		id: 'scale', label: 'Scale', group: 'shape', kind: 'number', source: 'prop',
		min: 0.1, max: 10, step: 0.05,
		caption: 'Radius · scale', paired: true, glyph: 'scale',
		hint: 'The stock multiplier behind every derived size — stroke, label, padding.',
		applies: (shape) => typeof propOf(shape, 'scale') === 'number',
		read: (shape) => round(propOf(shape, 'scale') as number, 2),
		write: (editor, shapes, value) => {
			const scale = Math.max(0.1, Number(value))
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, props: { scale },
			})))
		},
	},
	propField('flipX', 'Flip X', 'shape', 'flipX', 'toggle', { caption: 'Flip' }),
	propField('flipY', 'Flip Y', 'shape', 'flipY', 'toggle', { caption: 'Flip' }),
	styleField('spline', 'Spline', 'shape', LineShapeSplineStyle as EnumStyleProp<string>, 'spline', {
		labels: { line: 'Straight', cubic: 'Curved' },
	}),
	propField('isClosed', 'Closed', 'shape', 'isClosed', 'toggle', {
		hint: 'A closed freehand stroke takes a fill.',
	}),
	// draw and highlight both carry it — set from pressure at draw time
	// (tldraw checks the first two points' `z`), editable after the fact.
	propField('isPen', 'Pen input', 'shape', 'isPen', 'toggle', {
		hint: 'Set automatically from pressure at draw time (tldraw checks the first two points); editable after the fact.',
	}),
	// M3: draw and highlight resize through a PER-AXIS scale (`resizeShape`
	// multiplies `props.scaleX`/`scaleY` — see `DrawShapeUtil.onResize`), not
	// through `w`/`h` the way every other shape does; neither prop exists on
	// their schemas at all. Negative values are how tldraw itself represents
	// a flip on these two shapes, so the row allows them rather than clamping
	// at 0 the way `scale` (a magnitude, never a sign) does.
	{
		id: 'scaleX', label: 'Scale X', group: 'shape', kind: 'number', source: 'prop',
		min: -10, max: 10, step: 0.05,
		caption: 'Draw scale', paired: true, glyph: 'x',
		hint: 'Per-axis resize factor for a freehand stroke or highlighter — negative flips it.',
		applies: (shape) => typeof propOf(shape, 'scaleX') === 'number',
		read: (shape) => round(propOf(shape, 'scaleX') as number, 2),
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, props: { scaleX: Number(value) },
			})))
		},
	},
	{
		id: 'scaleY', label: 'Scale Y', group: 'shape', kind: 'number', source: 'prop',
		min: -10, max: 10, step: 0.05,
		caption: 'Draw scale', paired: true, glyph: 'y',
		applies: (shape) => typeof propOf(shape, 'scaleY') === 'number',
		read: (shape) => round(propOf(shape, 'scaleY') as number, 2),
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, props: { scaleY: Number(value) },
			})))
		},
	},

	/* ----------------------------------------------------------------- fill */
	styleField('fill', 'Fill style', 'fill', DefaultFillStyle as EnumStyleProp<string>, 'fill', {
		hint: 'Six stock fills. tldraw 5 added `fill` and `lined-fill`; the stock picker shows four.',
	}),
	styleField('color', 'Colour', 'fill', DefaultColorStyle as EnumStyleProp<string>, 'color', {
		kind: 'swatches',
		options: (editor) => paletteOptions(editor),
		// M3: was `shape.type !== 'frame' && hasProp(shape, 'color')` — a frame's
		// `color` prop exists unconditionally, so that hard-coded exclusion was
		// standing in for the real question. `styleReaches` asks the engine
		// instead: `configuredUtils.ts` only calls `FrameShapeUtil.configure({
		// showColors: true })` when `?frames=colors` opted in (off by default —
		// see that switch's own WHY), which is what registers `color` as a
		// genuine StyleProp for `frame`, reaching its `showColorsFillColor`/
		// `showColorsStrokeColor`/heading variants. `frameShowColorsOn` asks the
		// SAME question a second, more direct way (reads `util.options.showColors`
		// straight off the configured util) — belt-and-suspenders after
		// `tests/compat_smoke.mjs` caught a frame painting its own colour with no
		// visible control for it, the inverse of "does nothing" but the same rule.
		// A plain load (switch off, stock route, or `showColors` never configured)
		// keeps withholding this row, honestly.
		applies: (shape, editor) => styleReaches(shape, editor, DefaultColorStyle as EnumStyleProp<string>)
			&& (shape.type !== 'frame' || frameShowColorsOn(shape, editor)),
	}),
	paintField('fillColor', 'Fill', 'fill', 'fillColor', 'color', HAS_FILL, {
		hint: 'Any CSS colour, painted through the engine’s own display-value seam.',
	}),
	paintField('fillOpacity', 'Fill alpha', 'fill', 'fillOpacity', 'number', HAS_FILL, {
		min: 0, max: 1, step: 0.01,
		caption: 'Exact fill', paired: true, glyph: 'opacity', fallback: 1,
		hint: 'Transparency for the interior alone — the outline and label stay opaque.',
	}),
	// M3: geo, draw and arrow all declare this — the flat colour tldraw's own
	// `PatternFill` paints instead of the diagonal-line pattern once you're
	// zoomed out far enough (effective zoom <= 0.18) that the lines would
	// alias into noise. Gated on `fill === 'pattern'`: at any other fill style
	// nothing ever reads it, and the row would write meta that paints nothing.
	paintField('patternFillFallbackColor', 'Pattern fallback', 'fill', 'patternFillFallbackColor', 'color',
		(shape) => HAS_FILL(shape) && propOf(shape, 'fill') === 'pattern', {
		hint: 'The flat colour painted in place of the diagonal pattern once zoomed far enough out that the lines would alias.',
	}),

	/* --------------------------------------------------------------- stroke */
	styleField('dash', 'Line style', 'stroke', DefaultDashStyle as EnumStyleProp<string>, 'dash', {
		hint: '`none` is a stock dash value with no button in the stock picker: an outline-free shape.',
	}),
	styleField('size', 'Size rung', 'stroke', DefaultSizeStyle as EnumStyleProp<string>, 'size', {
		hint: 'One rung drives outline width AND label size. The two rows below break that coupling.',
	}),
	paintField('strokeColor', 'Stroke', 'stroke', 'strokeColor', 'color', HAS_OUTLINE),
	paintField('strokeWidth', 'Stroke width', 'stroke', 'strokeWidth', 'number', HAS_OUTLINE, {
		min: 0.25, max: 24, step: 0.25, unit: 'px',
		caption: 'Exact stroke', paired: true, glyph: 'weight', fallback: 3.5,
	}),
	// WHY the dash test: tldraw only rounds the corners of a `draw` outline, so on
	// the app's default `solid` dash this row moved the painted path not at all.
	paintField('strokeRoundness', 'Corner round', 'stroke', 'strokeRoundness', 'number',
		(shape) => shape.type === 'geo' && propOf(shape, 'dash') === 'draw', {
		min: 0, max: 60, step: 1, unit: 'px',
		caption: 'Exact stroke', paired: true, glyph: 'radius', fallback: 7,
		hint: 'tldraw derives this as stroke × 2 and never exposes it. Rounds the drawn outline’s corners.',
	}),

	/* ---------------------------------------------------------------- label */
	styleField('font', 'Font', 'label', DefaultFontStyle as EnumStyleProp<string>, 'font', {
		labels: { draw: 'Draw', sans: 'Sans', serif: 'Serif', mono: 'Mono' },
	}),
	styleField('align', 'Align', 'label', DefaultHorizontalAlignStyle as EnumStyleProp<string>, 'align', {
		// The three legacy values are real enum members but exist only so old
		// files keep opening; offering them would let a person author a state
		// tldraw is trying to retire.
		options: () => [
			{ value: 'start', label: 'Left' },
			{ value: 'middle', label: 'Centre' },
			{ value: 'end', label: 'Right' },
		],
	}),
	styleField('verticalAlign', 'V align', 'label', DefaultVerticalAlignStyle as EnumStyleProp<string>, 'verticalAlign', {
		labels: { start: 'Top', middle: 'Middle', end: 'Bottom' },
	}),
	styleField('textAlign', 'Align', 'label', DefaultTextAlignStyle as EnumStyleProp<string>, 'textAlign', {
		labels: { start: 'Left', middle: 'Centre', end: 'Right' },
	}),
	{
		id: 'labelColorProp', label: 'Label', group: 'label', kind: 'swatches', source: 'prop',
		applies: (shape) => typeof propOf(shape, 'labelColor') === 'string',
		read: (shape) => propOf(shape, 'labelColor') as string,
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, props: { labelColor: String(value) },
			})))
		},
		options: (editor) => paletteOptions(editor),
	},
	paintField('labelColor', 'Ink', 'label', 'labelColor', 'color', HAS_LABEL),
	// The panel's whole thesis is "the picker offers four rungs, the engine takes
	// anything" — and font family was the one place that did not follow through.
	// `labelFontFamily` (`fontFamily` on a text shape) is an ordinary display
	// value that accepts any CSS font stack.
	paintField('labelFontFamily', 'Typeface', 'label', 'labelFontFamily', 'text', HAS_LABEL, {
		hint: 'Any CSS font stack, e.g. "Inter, sans-serif". tldraw’s picker offers four families.',
	}),
	paintField('labelFontSize', 'Font size', 'label', 'labelFontSize', 'number', HAS_LABEL, {
		min: 6, max: 96, step: 1, unit: 'px',
		caption: 'Exact type', paired: true, glyph: 'type', fallback: 24,
		hint: 'Off the four-rung ladder, without moving the outline width with it.',
	}),
	paintField('labelLineHeight', 'Line height', 'label', 'labelLineHeight', 'number', HAS_LABEL, {
		min: 0.8, max: 3, step: 0.05,
		caption: 'Exact type', paired: true, glyph: 'lineHeight', fallback: 1.35,
	}),
	paintField('labelPadding', 'Label pad', 'label', 'labelPadding', 'number', (shape) => shape.type === 'geo' || shape.type === 'note' || shape.type === 'arrow', {
		min: 0, max: 48, step: 1, unit: 'px',
		caption: 'Exact type', paired: true, glyph: 'padding', fallback: 16,
	}),
	// M3, geo only: the two GeoShapeUtilDisplayValues keys the census found
	// cheap to reach. `labelEdgeMargin` is the margin between the label's own
	// edge and the shape's edge (tldraw hard-codes 8); `labelMinWidth` is the
	// width GEO_SHAPE_MIN_WIDTHS[size] reserves for the label before it wraps
	// harder than the size rung would otherwise force.
	paintField('labelEdgeMargin', 'Label edge margin', 'label', 'labelEdgeMargin', 'number', (shape) => shape.type === 'geo', {
		min: 0, max: 64, step: 1, unit: 'px',
		caption: 'Label fit', paired: true, glyph: 'padding', fallback: 8,
	}),
	paintField('labelMinWidth', 'Label min width', 'label', 'labelMinWidth', 'number', (shape) => shape.type === 'geo', {
		min: 0, max: 400, step: 1, unit: 'px',
		caption: 'Label fit', paired: true, glyph: 'w', fallback: 32,
		hint: 'GEO_SHAPE_MIN_WIDTHS[size] — the width tldraw reserves before the label wraps harder.',
	}),
	// WHY text-only: `labelFontWeight`/`labelFontStyle` appear in tldraw's whole
	// shipped renderer at their two DECLARATION sites and nowhere else — neither
	// `RichTextLabel` nor `PlainTextLabel` takes them. Only `TextShapeUtil` reads
	// its `fontWeight`/`fontStyle` display values. On a geo, note or arrow these
	// rows wrote meta, lit the overridden dot, and changed nothing.
	paintField('labelFontWeight', 'Weight', 'label', 'labelFontWeight', 'segments', TEXT_ONLY, {
		options: () => ['300', '400', '500', '600', '700', '800'].map((value) => ({ value, label: value })),
	}),
	paintField('labelFontStyle', 'Italic', 'label', 'labelFontStyle', 'segments', TEXT_ONLY, {
		options: () => [
			{ value: 'normal', label: 'Normal' },
			{ value: 'italic', label: 'Italic' },
		],
	}),
	{
		id: 'textOutline', label: 'White halo', group: 'label', kind: 'toggle', source: 'paint',
		overrideField: 'textOutline',
		// WHY this row exists: tldraw paints a ~2px halo in the canvas
		// background colour behind every label so text stays legible over a
		// line crossing it. On a white board that reads as a white smear
		// eating the space around the glyphs, and there has never been a
		// control for it. The engine already made it a CSS custom property
		// (`--tl-text-outline`), so switching it off is stock, not a fork.
		hint: 'tldraw’s background-coloured text halo. On a white board it reads as a white smear.',
		// WHY a note is excluded: `NoteShapeUtil` passes `showTextOutline={false}`
		// as a literal, so a sticky's label has never had a halo to switch off.
		// Offering the row there reported the opposite of what was on screen and
		// then did nothing — the exact "control that does nothing is a lie" this
		// file's own rule forbids.
		//
		// `paintReaches` is the same guard: the halo is switched off by the
		// `withPrimitiveOverrides` wrapper's inherited `--tl-text-outline`, which
		// the bare `?stock-inspector` canvas does not apply.
		applies: (shape, editor) =>
			paintReaches(shape, editor) && shape.type !== 'note' && HAS_LABEL(shape),
		read: (shape) => readPrimitiveOverride(shape).textOutline !== false,
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id,
				type: shape.type,
				// `true` is tldraw's own behaviour, so it clears rather than stores.
				meta: writePrimitiveOverride(shape, { textOutline: value ? undefined : false }),
			})))
		},
	},
	propField('autoSize', 'Auto width', 'label', 'autoSize', 'toggle', {
		hint: 'Off lets a text shape hold a fixed measure and wrap.',
	}),
	{
		id: 'fontSizeAdjustment', label: 'Fit ratio', group: 'label', kind: 'number', source: 'prop',
		min: 0.2, max: 1, step: 0.01,
		caption: 'Exact type', paired: true, glyph: 'fit',
		hint: 'A note’s shrink-to-fit ratio, which the engine writes and never lets you set.',
		applies: (shape) => shape.type === 'note',
		read: (shape) => {
			const value = propOf(shape, 'fontSizeAdjustment')
			return typeof value === 'number' ? round(value, 2) : 1
		},
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, props: { fontSizeAdjustment: Number(value) },
			})))
		},
	},

	/* ---------------------------------------------------------------- arrow */
	styleField('arrowKind', 'Route', 'arrow', ArrowShapeKindStyle as EnumStyleProp<string>, 'kind', {
		labels: { arc: 'Arc', elbow: 'Elbow' },
	}),
	styleField('arrowheadStart', 'Start head', 'arrow', ArrowShapeArrowheadStartStyle as EnumStyleProp<string>, 'arrowheadStart', {
		kind: 'tiles',
		options: () => (ArrowShapeArrowheadStartStyle as EnumStyleProp<string>).values.map((value) => ({
			value, label: value, path: ARROWHEAD_PATHS[value],
		})),
	}),
	styleField('arrowheadEnd', 'End head', 'arrow', ArrowShapeArrowheadEndStyle as EnumStyleProp<string>, 'arrowheadEnd', {
		kind: 'tiles',
		options: () => (ArrowShapeArrowheadEndStyle as EnumStyleProp<string>).values.map((value) => ({
			value, label: value, path: ARROWHEAD_PATHS[value],
		})),
	}),
	{
		id: 'bend', label: 'Bend', group: 'arrow', kind: 'number', source: 'prop',
		min: -400, max: 400, step: 1,
		caption: 'Route', paired: true, glyph: 'bend',
		applies: (shape) => shape.type === 'arrow' && propOf(shape, 'kind') !== 'elbow',
		read: (shape) => round(propOf(shape, 'bend') as number, 1),
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, props: { bend: Number(value) },
			})))
		},
	},
	{
		id: 'labelPosition', label: 'Label at', group: 'arrow', kind: 'number', source: 'prop',
		min: 0, max: 1, step: 0.01,
		caption: 'Route', paired: true, glyph: 'along',
		hint: 'How far along the shaft the label rides. Stock, and draggable only by pointer.',
		applies: (shape) => shape.type === 'arrow',
		read: (shape) => round(propOf(shape, 'labelPosition') as number, 2),
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, props: { labelPosition: Number(value) },
			})))
		},
	},
	{
		id: 'elbowMidPoint', label: 'Elbow at', group: 'arrow', kind: 'number', source: 'prop',
		min: 0, max: 1, step: 0.01,
		caption: 'Route', paired: true, glyph: 'along',
		applies: (shape) => shape.type === 'arrow' && propOf(shape, 'kind') === 'elbow',
		read: (shape) => round(propOf(shape, 'elbowMidPoint') as number, 2),
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, props: { elbowMidPoint: Number(value) },
			})))
		},
	},
	paintField('arrowLabelRadius', 'Label radius', 'arrow', 'arrowLabelRadius', 'number', (shape) => shape.type === 'arrow', {
		min: 0, max: 24, step: 0.5, unit: 'px',
		caption: 'Label plate', paired: true, glyph: 'radius', fallback: 3.5,
	}),
	// WHY no `arrowRouting` (Slant) field here: the donor's row is SystemSketch's
	// own slanted-arrow util, not a stock tldraw capability — this lab's whole
	// premise is stock tldraw plus an inert chrome stack, so it was dropped along
	// with its `../systemSketchArrow` imports as one of the two sanctioned edits
	// to this port. See docs/log.md's M2 entry.

	/* ----------------------------------------------------------------- note */
	paintField('noteWidth', 'Note width', 'note', 'noteWidth', 'number', (shape) => shape.type === 'note', {
		min: 60, max: 640, step: 10, unit: 'px',
		caption: 'Sticky size', paired: true, glyph: 'w', fallback: 200,
		hint: 'tldraw hard-codes a sticky at 200 × 200. The seam behind it takes any number.',
	}),
	paintField('noteHeight', 'Note height', 'note', 'noteHeight', 'number', (shape) => shape.type === 'note', {
		min: 60, max: 640, step: 10, unit: 'px',
		caption: 'Sticky size', paired: true, glyph: 'h', fallback: 200,
	}),
	/*
	 * NOT OFFERED: a sticky's ring.
	 *
	 * `borderWidth`/`borderColor` are real display values, but `NoteShapeUtil`
	 * paints them into `borderBottom` only while `hideShadows` is true — which
	 * `useEfficientZoomThreshold(0.25 / scale)` makes true only when the board is
	 * zoomed far out. At any working zoom the rows wrote meta, lit the overridden
	 * dot, and changed nothing a person could see. They come back the day the
	 * engine paints the ring at ordinary zoom.
	 *
	 * M3 re-confirmed this against 5.3.2's own `NoteShapeUtil.tsx` (still
	 * `hideShadows ? borderBottom(...) : boxShadow(...)`) rather than adding the
	 * two rows the brief listed: `noteBorderWidth`/`noteBorderColor` already
	 * exist on `PrimitiveOverride` and both `*OverrideDisplayValues` keys they'd
	 * feed are real, but the row would still be inert at ordinary zoom — the
	 * exact failure this comment exists to name. Documented unreached in
	 * `displayValueCensus.ts`, not wired.
	 */

	/* ------------------------------------------------------------ highlight */
	paintField('highlightUnderlayOpacity', 'Underlay', 'highlight', 'highlightUnderlayOpacity', 'number', (shape) => shape.type === 'highlight', {
		min: 0, max: 1, step: 0.01,
		caption: 'Passes', paired: true, glyph: 'opacity', fallback: 0.82,
		hint: 'The highlighter draws twice. The stock UI fixes the two passes at 0.82 and 0.35.',
	}),
	paintField('highlightOverlayOpacity', 'Overlay', 'highlight', 'highlightOverlayOpacity', 'number', (shape) => shape.type === 'highlight', {
		min: 0, max: 1, step: 0.01,
		caption: 'Passes', paired: true, glyph: 'opacity', fallback: 0.35,
	}),

	/* ---------------------------------------------------------------- frame */
	{
		// `mark: false` is passed by the panel for a text field, so a rename is one
		// history entry rather than one per keystroke.
		id: 'frameName', label: 'Name', group: 'frame', kind: 'text', source: 'prop',
		applies: (shape) => shape.type === 'frame',
		read: (shape) => propOf(shape, 'name') as string,
		write: (editor, shapes, value) => {
			updateShapes(editor, shapes.map((shape) => ({
				id: shape.id, type: shape.type, props: { name: String(value) },
			})))
		},
	},

	/* ---------------------------------------------------------------- media */
	propField('altText', 'Alt text', 'media', 'altText', 'text', {
		hint: 'Accessibility description. tldraw stores it; no stock control sets it.',
	}),
	// NOT OFFERED, image: `crop` is a rect (x/y/w/h into the source asset,
	// stock tldraw's own crop tool already edits it visually) — a numeric or
	// text row would be a worse editor than the one that exists, and building
	// a rect editor is out of scope for this milestone.
]

const GROUP_LABELS: Record<string, string> = {
	layer: 'Layer',
	shape: 'Shape',
	fill: 'Fill',
	stroke: 'Stroke',
	label: 'Text',
	arrow: 'Arrow',
	note: 'Sticky',
	highlight: 'Highlighter',
	frame: 'Frame',
	// M3: image/video have no other row at all (their DisplayValues interfaces
	// are empty — nothing to paint-override), so `altText` gets its own group
	// rather than folding into "Shape", which nothing else here shares with it.
	media: 'Media',
}

const GROUP_ORDER = ['layer', 'shape', 'fill', 'stroke', 'label', 'arrow', 'note', 'highlight', 'frame', 'media']

const FIELDS_BY_ID = new Map(FIELDS.map((field) => [field.id, field]))

/* ------------------------------------------------------------------- model */

function titleFor(shapes: TLShape[]): string {
	if (shapes.length === 1) {
		const [shape] = shapes
		const geo = propOf(shape, 'geo')
		return shape.type === 'geo' && typeof geo === 'string' ? geo : shape.type
	}
	const kinds = new Set(shapes.map((shape) => shape.type))
	if (kinds.size === 1) return `${shapes.length} ${[...kinds][0]}s`
	return `${shapes.length} shapes`
}

/**
 * The panel's whole state for the current selection, or `null` when nothing is
 * selected.
 *
 * A field appears when at least one selected shape claims it, and reads `null`
 * — the panel's "Mixed" — when the claimants disagree. That is tldraw's own
 * `SharedStyle` semantics, folded with the app's single `sharedValueAcross`.
 */
export function getPrimitiveInspectorModel(editor: Editor): PrimitiveInspectorModel | null {
	const shapes = editor.getSelectedShapes()
	if (shapes.length === 0) return null

	const groups = new Map<string, InspectorControl[]>()
	for (const field of FIELDS) {
		const claimants = shapes.filter((shape) => field.applies(shape, editor))
		if (claimants.length === 0) continue
		const shared = sharedValueAcross(claimants.map((shape) => field.read(shape, editor)))
		// An override row nobody has set yet has no reading — and it is exactly
		// the row a person needs in order to set one, so it is drawn as `auto`
		// rather than dropped. A stock-prop row with no reading really has
		// nothing to say and is dropped, as before.
		if (!shared && field.overrideField === undefined) continue
		const overridden = field.overrideField !== undefined
			&& claimants.some((shape) => readPrimitiveOverride(shape)[field.overrideField!] !== undefined)
		const control: InspectorControl = {
			id: field.id,
			label: field.label,
			kind: field.kind,
			source: field.source,
			value: !shared ? null : shared.type === 'shared' ? shared.value : null,
			...(shared ? {} : { unset: true as const }),
			...(field.options ? { options: field.options(editor) } : {}),
			...(field.min !== undefined ? { min: field.min } : {}),
			...(field.max !== undefined ? { max: field.max } : {}),
			...(field.step !== undefined ? { step: field.step } : {}),
			...(field.unit ? { unit: field.unit } : {}),
			...(field.caption ? { caption: field.caption } : {}),
			...(field.paired ? { paired: true as const } : {}),
			...(field.glyph ? { glyph: field.glyph } : {}),
			...(field.fallback !== undefined ? { fallback: field.fallback } : {}),
			...(field.disabled ? { disabled: true as const } : {}),
			...(field.hint ? { hint: field.hint } : {}),
			...(overridden ? { overridden } : {}),
		}
		const list = groups.get(field.group) ?? []
		list.push(control)
		groups.set(field.group, list)
	}

	return {
		count: shapes.length,
		shapeIds: shapes.map((shape) => shape.id),
		title: titleFor(shapes),
		types: [...new Set(shapes.map((shape) => shape.type))],
		groups: GROUP_ORDER.flatMap((id) => {
			const controls = groups.get(id)
			return controls ? [{ id, label: GROUP_LABELS[id], controls }] : []
		}),
		// WHY `isShapeOrAncestorLocked` and not `isLocked`: `updateShapes` skips a
		// shape whose ANCESTOR is locked, so a child of a locked frame reported
		// itself unlocked, offered no Unlock button, and answered every control
		// with silence. The panel now says so and offers the way out.
		// `some`, not `every`: a selection with one locked shape in it silently
		// wrote to the others and offered no Unlock at all.
		locked: shapes.some((shape) => editor.isShapeOrAncestorLocked(shape)),
		hasOverrides: shapes.some(hasPrimitiveOverride),
	}
}

/**
 * The shapes a dock action targets: the ones the panel was showing when it was
 * drawn, resolved fresh from the store, or the live selection when a caller
 * names none.
 *
 * WHY the panel names them: a text, colour or number field commits on BLUR, and
 * blur fires after tldraw has already moved the selection. Resolving
 * `getSelectedShapes()` at commit time threw the typed value away when the click
 * landed on empty canvas, and wrote it to the wrong shape when the click landed
 * on another one. Every mutating entry point below takes the same fence — apply,
 * clear one row, and reset all — because `ColorField` reaches the last two on
 * blur too.
 */
function intendedShapes(editor: Editor, shapeIds?: readonly string[]): TLShape[] {
	if (!shapeIds) return editor.getSelectedShapes()
	return shapeIds
		.map((shapeId) => editor.getShape(shapeId as TLShape['id']))
		.filter((shape): shape is TLShape => Boolean(shape))
}

/**
 * Apply one control's value to the selection, as one undo step.
 *
 * Only the shapes that claim the field are written, so a mixed selection does
 * not grow a prop on a shape that has no business carrying it.
 *
 * `mark` is false for every frame of a slider drag after the first, so one
 * drag is one Ctrl+Z rather than ninety — the same shape of decision tldraw
 * makes with `squashing` on its own style controls.
 */
export function applyPrimitiveInspectorControl(
	editor: Editor,
	id: string,
	value: InspectorValue,
	options: { mark?: boolean; shapeIds?: readonly string[] } = {},
): void {
	const field = FIELDS_BY_ID.get(id)
	if (!field) return
	const shapes = intendedShapes(editor, options.shapeIds).filter((shape) => field.applies(shape, editor))
	if (shapes.length === 0) return
	if (options.mark !== false) editor.markHistoryStoppingPoint(`inspector ${id}`)
	field.write(editor, shapes, value)
}

/**
 * Unlock everything standing between the selection and an edit.
 *
 * WHY it walks the ancestors: `updateShapes` accepts an `isLocked: false`
 * partial only for a shape that is ITSELF locked, and drops any shape whose
 * ancestor is locked before looking at the partial. So a child of a locked
 * frame was offered an Unlock button that could never do anything — the same
 * inert-control bug the lock reporting was fixed to avoid, one layer down.
 */
export function unlockPrimitiveInspectorSelection(editor: Editor): void {
	const locked = new Map<string, TLShape>()
	for (const shape of editor.getSelectedShapes()) {
		if (shape.isLocked) locked.set(shape.id, shape)
		for (const ancestor of editor.getShapeAncestors(shape)) {
			if (ancestor.isLocked) locked.set(ancestor.id, ancestor)
		}
	}
	if (locked.size === 0) return
	editor.markHistoryStoppingPoint('inspector unlock')
	updateShapes(editor, [...locked.values()].map((shape) => ({
		id: shape.id, type: shape.type, isLocked: false,
	})))
}

/**
 * Put one `paint` row back to whatever tldraw would have painted.
 *
 * `shapeIds` is the same fence `applyPrimitiveInspectorControl` takes:
 * `ColorField` calls this on blur, which is after the click that moved the
 * selection, so without it emptying A's colour cleared B's override instead.
 */
export function clearPrimitiveInspectorControl(
	editor: Editor,
	id: string,
	shapeIds?: readonly string[],
): void {
	const field = FIELDS_BY_ID.get(id)
	if (!field?.overrideField) return
	const shapes = intendedShapes(editor, shapeIds).filter((shape) => field.applies(shape, editor))
	if (shapes.length === 0) return
	editor.markHistoryStoppingPoint(`inspector clear ${id}`)
	updateShapes(editor, shapes.map((shape) => ({
		id: shape.id,
		type: shape.type,
		meta: writePrimitiveOverride(shape, { [field.overrideField!]: undefined }),
	})))
}

/**
 * Drop every override on the shapes the panel was showing; the stock props are
 * left alone. Same fence as {@link clearPrimitiveInspectorControl}.
 */
export function resetPrimitiveOverrides(editor: Editor, shapeIds?: readonly string[]): void {
	const shapes = intendedShapes(editor, shapeIds).filter(hasPrimitiveOverride)
	if (shapes.length === 0) return
	editor.markHistoryStoppingPoint('inspector reset paint')
	updateShapes(editor, shapes.map((shape) => ({
		id: shape.id, type: shape.type, meta: clearPrimitiveOverride(shape),
	})))
}

/**
 * A cheap identity for the current reading, so the panel re-renders only when
 * something it draws has moved — the model is recomputed on every frame a
 * shape is dragged.
 */
export function primitiveInspectorKey(model: PrimitiveInspectorModel | null): string | null {
	if (!model) return null
	const controls = model.groups.flatMap((group) => group.controls)
	return [
		model.count,
		model.title,
		model.locked ? 'locked' : '',
		controls.map((control) => `${control.id}=${control.unset ? 'auto' : control.value}${control.overridden ? '*' : ''}`).join(','),
	].join(':')
}
