/**
 * V2 "Canvas-native"'s own icon source: the exact SVGs stock tldraw's style
 * panel draws for fill/dash/size/font/align/valign/textAlign/arrowheads/
 * spline, re-coloured to the current control's ink instead of the flat
 * black `@tldraw/assets` ships them with.
 *
 * WHY a static import per file rather than `import.meta.glob` over the
 * whole icon set: `@tldraw/assets` has no `exports` restriction in its
 * `package.json` (checked directly, not assumed), so a deep subpath import
 * resolves fine — but globbing the entire 300+-icon set would pull every
 * unused geo/tool/style icon into this bundle for nine controls' worth of
 * enums. Each import below is one file this app actually draws.
 *
 * WHY `fill="#000"` is replaced with `currentColor` at import time instead
 * of overriding it with a CSS rule: these are inlined via
 * `dangerouslySetInnerHTML`, which is the only way to keep them real
 * `<path>` markup (not a rasterized `<img>`) without a bundler SVGR step
 * this app doesn't otherwise take on — a plain `color` CSS property has
 * nothing to inherit into once the fill is a literal hex baked into the
 * markup.
 */
import alignBottom from '@tldraw/assets/icons/icon/align-bottom.svg?raw'
import alignCenterHorizontal from '@tldraw/assets/icons/icon/align-center-horizontal.svg?raw'
import alignCenterVertical from '@tldraw/assets/icons/icon/align-center-vertical.svg?raw'
import alignLeft from '@tldraw/assets/icons/icon/align-left.svg?raw'
import alignRight from '@tldraw/assets/icons/icon/align-right.svg?raw'
import alignTop from '@tldraw/assets/icons/icon/align-top.svg?raw'
import arrowheadArrow from '@tldraw/assets/icons/icon/arrowhead-arrow.svg?raw'
import arrowheadBar from '@tldraw/assets/icons/icon/arrowhead-bar.svg?raw'
import arrowheadDiamond from '@tldraw/assets/icons/icon/arrowhead-diamond.svg?raw'
import arrowheadDot from '@tldraw/assets/icons/icon/arrowhead-dot.svg?raw'
import arrowheadNone from '@tldraw/assets/icons/icon/arrowhead-none.svg?raw'
import arrowheadSquare from '@tldraw/assets/icons/icon/arrowhead-square.svg?raw'
import arrowheadTriangle from '@tldraw/assets/icons/icon/arrowhead-triangle.svg?raw'
import arrowheadTriangleInverted from '@tldraw/assets/icons/icon/arrowhead-triangle-inverted.svg?raw'
import dashDashed from '@tldraw/assets/icons/icon/dash-dashed.svg?raw'
import dashDotted from '@tldraw/assets/icons/icon/dash-dotted.svg?raw'
import dashDraw from '@tldraw/assets/icons/icon/dash-draw.svg?raw'
import dashSolid from '@tldraw/assets/icons/icon/dash-solid.svg?raw'
import fillFill from '@tldraw/assets/icons/icon/fill-fill.svg?raw'
import fillLinedFill from '@tldraw/assets/icons/icon/fill-lined-fill.svg?raw'
import fillNone from '@tldraw/assets/icons/icon/fill-none.svg?raw'
import fillPattern from '@tldraw/assets/icons/icon/fill-pattern.svg?raw'
import fillSemi from '@tldraw/assets/icons/icon/fill-semi.svg?raw'
import fillSolid from '@tldraw/assets/icons/icon/fill-solid.svg?raw'
import fontDraw from '@tldraw/assets/icons/icon/font-draw.svg?raw'
import fontMono from '@tldraw/assets/icons/icon/font-mono.svg?raw'
import fontSans from '@tldraw/assets/icons/icon/font-sans.svg?raw'
import fontSerif from '@tldraw/assets/icons/icon/font-serif.svg?raw'
import horizontalAlignEnd from '@tldraw/assets/icons/icon/horizontal-align-end.svg?raw'
import horizontalAlignMiddle from '@tldraw/assets/icons/icon/horizontal-align-middle.svg?raw'
import horizontalAlignStart from '@tldraw/assets/icons/icon/horizontal-align-start.svg?raw'
import sizeExtraLarge from '@tldraw/assets/icons/icon/size-extra-large.svg?raw'
import sizeLarge from '@tldraw/assets/icons/icon/size-large.svg?raw'
import sizeMedium from '@tldraw/assets/icons/icon/size-medium.svg?raw'
import sizeSmall from '@tldraw/assets/icons/icon/size-small.svg?raw'
import splineCubic from '@tldraw/assets/icons/icon/spline-cubic.svg?raw'
import splineLine from '@tldraw/assets/icons/icon/spline-line.svg?raw'
import textAlignCenter from '@tldraw/assets/icons/icon/text-align-center.svg?raw'
import textAlignLeft from '@tldraw/assets/icons/icon/text-align-left.svg?raw'
import textAlignRight from '@tldraw/assets/icons/icon/text-align-right.svg?raw'
import verticalAlignEnd from '@tldraw/assets/icons/icon/vertical-align-end.svg?raw'
import verticalAlignMiddle from '@tldraw/assets/icons/icon/vertical-align-middle.svg?raw'
import verticalAlignStart from '@tldraw/assets/icons/icon/vertical-align-start.svg?raw'

/** `id` matches `inspectorModel.ts`'s FieldSpec id; the inner key matches
 *  the tldraw StyleProp's own enum value verbatim (checked against
 *  `@tldraw/tlschema`'s `.d.ts`, not assumed) — an unmapped value (arrow's
 *  `pipe`, which has no matching asset) falls back to the plain text label
 *  in `Inspector.tsx`, never a missing icon. */
export const TLDRAW_ICONS: Record<string, Record<string, string>> = {
	fill: { none: fillNone, semi: fillSemi, solid: fillSolid, pattern: fillPattern, fill: fillFill, 'lined-fill': fillLinedFill },
	dash: { draw: dashDraw, solid: dashSolid, dashed: dashDashed, dotted: dashDotted },
	size: { s: sizeSmall, m: sizeMedium, l: sizeLarge, xl: sizeExtraLarge },
	font: { draw: fontDraw, sans: fontSans, serif: fontSerif, mono: fontMono },
	align: { start: horizontalAlignStart, middle: horizontalAlignMiddle, end: horizontalAlignEnd },
	verticalAlign: { start: verticalAlignStart, middle: verticalAlignMiddle, end: verticalAlignEnd },
	textAlign: { start: textAlignLeft, middle: textAlignCenter, end: textAlignRight },
	spline: { line: splineLine, cubic: splineCubic },
	arrowheadStart: {
		none: arrowheadNone, arrow: arrowheadArrow, triangle: arrowheadTriangle, square: arrowheadSquare,
		dot: arrowheadDot, diamond: arrowheadDiamond, bar: arrowheadBar, inverted: arrowheadTriangleInverted,
	},
	arrowheadEnd: {
		none: arrowheadNone, arrow: arrowheadArrow, triangle: arrowheadTriangle, square: arrowheadSquare,
		dot: arrowheadDot, diamond: arrowheadDiamond, bar: arrowheadBar, inverted: arrowheadTriangleInverted,
	},
	// Bonus alignment row some layouts offer as plain left/center/right/top/
	// bottom rather than start/middle/end — kept for completeness, unused by
	// any current FieldSpec id.
	horizontalAlignLTR: { left: alignLeft, center: alignCenterHorizontal, right: alignRight },
	verticalAlignLTR: { top: alignTop, middle: alignCenterVertical, bottom: alignBottom },
}

const CACHE = new Map<string, string>()
/**
 * WHY the root `<svg>`'s own `width="30" height="30"` attributes are
 * stripped, not just recoloured: `@tldraw/assets` ships every icon at a
 * fixed 30px intrinsic size baked into the markup itself — a wrapping
 * `<span className="size-4">` sizes the SPAN, but an HTML `width`/`height`
 * ATTRIBUTE on the injected `<svg>` wins over any CSS the span could apply,
 * so every icon rendered at its native 30px regardless of the wrapper
 * (round-2 audit: "Fill style and Size rung glyphs are clipped and
 * oversized" in a 22px segment item). Replacing them with an inline
 * `width:100%;height:100%` lets the svg fill whatever box its `<span>`
 * wrapper is actually given.
 */
function recolored(svg: string): string {
	const cached = CACHE.get(svg)
	if (cached) return cached
	let next = svg.replace(/fill="#000"/g, 'fill="currentColor"')
	next = next
		.replace('<svg ', '<svg style="display:block;width:100%;height:100%" ')
		.replace(/(<svg\b[^>]*?)\swidth="\d+"/, '$1')
		.replace(/(<svg\b[^>]*?)\sheight="\d+"/, '$1')
	CACHE.set(svg, next)
	return next
}

export function TldrawIcon({ id, value, className }: { id: string; value: string; className?: string }) {
	const svg = TLDRAW_ICONS[id]?.[value]
	if (!svg) return null
	return (
		<span
			className={className}
			aria-hidden="true"
			// eslint-disable-next-line react/no-danger -- static, bundle-time SVG text, never user input
			dangerouslySetInnerHTML={{ __html: recolored(svg) }}
		/>
	)
}
