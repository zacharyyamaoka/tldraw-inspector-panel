/**
 * The census: every display-value key stock tldraw's `*ShapeUtilDisplayValues`
 * interfaces declare, and whether this app's inspector reaches it.
 *
 * WHY this file exists at all, and is checked by a test that reads
 * `node_modules` rather than trusting this list: `inspectorModel.ts`'s rows
 * are hand-written against one pinned tldraw version, and "the inspector
 * exposes everything the canvas can render" is a claim about the ENGINE's
 * surface, not about this file's own opinion of it. `displayValueCensus.test.ts`
 * re-parses the interfaces straight out of `node_modules/tldraw` at test time
 * (the same move SystemSketch's `docs/build_font_size_type_role.py` makes
 * against tldraw's own constants) and asserts `REACHED ∪ DOCUMENTED` equals
 * every key the real source declares — so a tldraw bump that adds, renames or
 * removes a display value fails HERE first, as a red test, rather than as a
 * silent gap nobody notices.
 *
 * "Reached" means an inspector row's write ends up read by the shape's own
 * `getCustomDisplayValues`/`getDefaultDisplayValues` — a `paint` row through
 * `overrides.ts`'s `*OverrideDisplayValues` functions, or a `style`/`prop` row
 * whose value the shape's own display-value formula reads directly (a geo's
 * `align` StyleProp, for instance, IS `labelHorizontalAlign` once
 * `GEO_SHAPE_HORIZONTAL_ALIGNS` maps it). A key that is merely *declared* on
 * the interface but never actually consumed by that shape's renderer (see the
 * geo/note `labelFontWeight` case below) is documented unreached, not reached
 * — matching `inspectorModel.ts`'s own "a control that does nothing is a lie"
 * rule; the census would otherwise credit a row for painting nothing.
 */

export type DisplayValueShapeKind =
	| 'geo'
	| 'text'
	| 'line'
	| 'draw'
	| 'arrow'
	| 'note'
	| 'highlight'
	| 'frame'
	| 'image'
	| 'video'
	| 'bookmark'
	| 'embed'

/** Where the census test finds the ground truth for each shape kind, paths
 *  relative to `node_modules/tldraw/src/lib/shapes/`. */
export const DISPLAY_VALUE_SOURCES: Record<DisplayValueShapeKind, { file: string; interfaceName: string }> = {
	geo: { file: 'geo/GeoShapeUtil.tsx', interfaceName: 'GeoShapeUtilDisplayValues' },
	text: { file: 'text/TextShapeUtil.tsx', interfaceName: 'TextShapeUtilDisplayValues' },
	line: { file: 'line/LineShapeUtil.tsx', interfaceName: 'LineShapeUtilDisplayValues' },
	draw: { file: 'draw/DrawShapeUtil.tsx', interfaceName: 'DrawShapeUtilDisplayValues' },
	// WHY `arrow-types.ts` and not `ArrowShapeUtil.tsx`: tldraw declares this
	// one interface in its own module (imported back into the util) rather
	// than inline with the other eleven.
	arrow: { file: 'arrow/arrow-types.ts', interfaceName: 'ArrowShapeUtilDisplayValues' },
	note: { file: 'note/NoteShapeUtil.tsx', interfaceName: 'NoteShapeUtilDisplayValues' },
	highlight: { file: 'highlight/HighlightShapeUtil.tsx', interfaceName: 'HighlightShapeUtilDisplayValues' },
	frame: { file: 'frame/FrameShapeUtil.tsx', interfaceName: 'FrameShapeUtilDisplayValues' },
	image: { file: 'image/ImageShapeUtil.tsx', interfaceName: 'ImageShapeUtilDisplayValues' },
	video: { file: 'video/VideoShapeUtil.tsx', interfaceName: 'VideoShapeUtilDisplayValues' },
	// WHY `= object`, not `interface X {}`: tldraw spells an empty one this way
	// here (only here) — the census parser accepts both forms as "zero keys".
	bookmark: { file: 'bookmark/BookmarkShapeUtil.tsx', interfaceName: 'BookmarkShapeUtilDisplayValues' },
	embed: { file: 'embed/EmbedShapeUtil.tsx', interfaceName: 'EmbedShapeUtilDisplayValues' },
}

/**
 * Keys this app's inspector actually reaches, per shape kind — verified by
 * hand against each shape's `getDefaultDisplayValues`/`getCustomDisplayValues`
 * (see the file header) and cross-checked by `inspectorModel.test.ts`'s own
 * per-field cases. Re-measured at 5.3.2; the donor's 42/31/73 (a different
 * tldraw version, and one un-diagnosed bug — see `configuredUtils.ts`'s
 * `defaultFillColorFor` WHY) is provenance, not a target to match.
 */
export const REACHED: Record<DisplayValueShapeKind, ReadonlySet<string>> = {
	geo: new Set([
		'strokeColor', 'strokeRoundness', 'strokeWidth', 'fillColor',
		'patternFillFallbackColor', 'labelColor', 'labelFontFamily', 'labelFontSize',
		'labelMinWidth', 'labelLineHeight', 'labelHorizontalAlign', 'labelVerticalAlign',
		'labelPadding', 'labelEdgeMargin',
	]),
	text: new Set(['color', 'fontFamily', 'fontSize', 'lineHeight', 'fontWeight', 'fontStyle']),
	line: new Set(['strokeColor', 'strokeWidth']),
	draw: new Set(['strokeColor', 'strokeWidth', 'fillColor', 'patternFillFallbackColor']),
	arrow: new Set([
		'strokeColor', 'strokeWidth', 'fillColor', 'patternFillFallbackColor',
		'labelColor', 'labelFontFamily', 'labelFontSize', 'labelLineHeight',
		'labelPadding', 'labelBorderRadius',
	]),
	note: new Set([
		'noteWidth', 'noteHeight', 'noteBackgroundColor', 'labelColor', 'labelFontFamily',
		'labelFontSize', 'labelLineHeight', 'labelPadding', 'labelHorizontalAlign',
		'labelVerticalAlign',
	]),
	highlight: new Set(['strokeColor', 'strokeWidth', 'underlayOpacity', 'overlayOpacity']),
	// Reached via the single `color` StyleProp row, now that `configuredUtils.ts`
	// configures `showColors: true` — see `inspectorModel.ts`'s `styleReaches`.
	// All five are DERIVED from that one prop; there is no independent knob for
	// "heading colour" apart from the frame's own colour.
	frame: new Set([
		'showColorsFillColor', 'showColorsStrokeColor', 'showColorsHeadingFillColor',
		'showColorsHeadingStrokeColor', 'showColorsHeadingTextColor',
	]),
	image: new Set([]),
	video: new Set([]),
	bookmark: new Set([]),
	embed: new Set([]),
}

/** Unreached keys, one line each on why. `reached ∪ documented` must equal
 *  every key the live interface declares — the test enforces this, not this
 *  file's own bookkeeping. */
export const DOCUMENTED: Record<DisplayValueShapeKind, Record<string, string>> = {
	geo: {
		labelExtraPadding: 'derived automatically from the stroke width via the size rung (theme.strokeWidth * STROKE_SIZES[size]); no override slot, and decoupling it risks the label colliding with a thicker outline with no engine safeguard.',
		labelFontWeight: "declared on the interface but GeoShapeUtil's label component never reads it (only TextShapeUtil's own PlainTextLabel/RichTextLabel consume fontWeight/fontStyle) — a row here would write meta and paint nothing; same TEXT_ONLY guard `inspectorModel.ts` already documents.",
		labelFontVariant: "hardcoded 'normal' in getDefaultDisplayValues; no shape prop or option drives it, and no stock control offers font-variant either.",
		labelFontStyle: 'same non-consumption as labelFontWeight above — geo never reads its own labelFontStyle display value.',
		minSizeWithLabel: 'a fixed constant ((LABEL_PADDING + 1) * 3), not derived from anything shape-specific — nothing meaningful to expose as a control.',
	},
	text: {
		fontVariant: "no override slot in PrimitiveOverride, and tldraw's own picker offers no font-variant control either — nothing to write it with.",
	},
	line: {},
	draw: {},
	arrow: {},
	note: {
		borderColor: "real display value, but NoteShapeUtil paints it into borderBottom only while hideShadows is true (useEfficientZoomThreshold(0.25/scale)) — inert at ordinary zoom. See inspectorModel.ts's 'NOT OFFERED: a sticky's ring'.",
		borderWidth: 'same hideShadows gate as borderColor — inert at ordinary zoom.',
		labelFontWeight: 'same non-consumption as geo — NoteShapeUtil hardcodes TEXT_PROPS.fontWeight and never reads its own display value.',
		labelFontVariant: 'hardcoded TEXT_PROPS.fontVariant; no control offered anywhere for it.',
		labelFontStyle: 'same non-consumption as labelFontWeight above.',
	},
	highlight: {},
	frame: {
		fillColor: 'the showColors:false default fill (always black) — with this app permanently configuring showColors:true, the util always selects showColorsFillColor instead, so this key is computed but never painted here.',
		strokeColor: 'same permanently-superseded case as fillColor.',
		headingFillColor: 'same — superseded by showColorsHeadingFillColor once showColors is on.',
		headingStrokeColor: 'same — superseded by showColorsHeadingStrokeColor.',
		headingTextColor: 'same — superseded by showColorsHeadingTextColor.',
	},
	image: {},
	video: {},
	bookmark: {},
	embed: {
		showShadow: 'hardcoded true in getDefaultDisplayValues; no shape prop or option drives it — every embed always casts the drop shadow.',
	},
}
