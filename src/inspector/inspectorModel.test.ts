/**
 * The inspector's read model, without a DOM.
 *
 * The fixture below is a stand-in for the tldraw Editor's selection surface —
 * enough for "which rows does a rectangle get, and what does a write do", which
 * is what this file is the oracle for. It is deliberately *not* the oracle for
 * tldraw's own write semantics; that claim is proven against a real editor in
 * `tests/primitive_inspector_smoke.mjs`.
 */
import { describe, expect, it } from 'vitest'
import type { Editor, TLShape } from 'tldraw'

import {
	applyPrimitiveInspectorControl,
	clearPrimitiveInspectorControl,
	getPrimitiveInspectorModel,
	primitiveInspectorKey,
	resetPrimitiveOverrides,
	type PrimitiveInspectorModel,
} from './inspectorModel'
import {
	SYSTEMSKETCH_PRIMITIVE_OVERRIDE_META_KEY as KEY,
	hasPrimitiveOverride,
	markResolvesPrimitiveOverrides,
} from './overrides'

interface FakeShape {
	id: string
	type: string
	rotation: number
	opacity: number
	isLocked: boolean
	props: Record<string, unknown>
	meta: Record<string, unknown>
}

function geo(id: string, props: Record<string, unknown> = {}, extra: Partial<FakeShape> = {}): FakeShape {
	return {
		id: `shape:${id}`,
		type: 'geo',
		rotation: 0,
		opacity: 1,
		isLocked: false,
		meta: {},
		props: {
			geo: 'rectangle', w: 100, h: 60, color: 'black', labelColor: 'black', fill: 'none',
			dash: 'draw', size: 'm', font: 'draw', align: 'middle', verticalAlign: 'middle',
			growY: 0, url: '', scale: 1, flipX: false, flipY: false, richText: { type: 'doc' },
			...props,
		},
		...extra,
	}
}

function note(id: string): FakeShape {
	return {
		id: `shape:${id}`, type: 'note', rotation: 0, opacity: 1, isLocked: false, meta: {},
		props: {
			color: 'yellow', labelColor: 'black', size: 'm', font: 'draw', fontSizeAdjustment: null,
			align: 'middle', verticalAlign: 'middle', growY: 0, url: '',
			richText: { type: 'doc' }, scale: 1,
		},
	}
}

function frame(id: string): FakeShape {
	return {
		id: `shape:${id}`, type: 'frame', rotation: 0, opacity: 1, isLocked: false, meta: {},
		props: { w: 400, h: 300, name: 'Frame', color: 'black' },
	}
}

function arrow(id: string, props: Record<string, unknown> = {}): FakeShape {
	return {
		id: `shape:${id}`,
		type: 'arrow',
		rotation: 0,
		opacity: 1,
		isLocked: false,
		meta: {},
		props: {
			kind: 'arc', color: 'black', labelColor: 'black', fill: 'none', dash: 'draw', size: 'm',
			arrowheadStart: 'none', arrowheadEnd: 'arrow', font: 'draw',
			start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, bend: 0,
			richText: { type: 'doc' }, labelPosition: 0.5, scale: 1, elbowMidPoint: 0.5,
			...props,
		},
	}
}

interface FakeEditorCalls {
	nextStyles: Array<[string, string]>
	updates: Array<Record<string, unknown>>
	marks: string[]
}

/**
 * `paintSeam` mirrors whether a configured ShapeUtil that resolves `meta`
 * overrides is installed — true on the in-app dock, false on the bare
 * `?stock-inspector` canvas. The default is the app route, which every
 * pre-existing case here assumes.
 */
function fakeEditor(shapes: FakeShape[], { paintSeam = true }: { paintSeam?: boolean } = {}) {
	const calls: FakeEditorCalls = { nextStyles: [], updates: [], marks: [] }
	// A branded stand-in for a configured util; `paintReaches` reads the flag off
	// the util `getShapeUtil` returns.
	class FakePaintUtil {
		// WHY a plain field assignment and not the donor's constructor-parameter
		// shorthand: this repo's tsconfig enables `erasableSyntaxOnly` (TS 6),
		// which forbids parameter properties as non-erasable syntax. Same
		// behaviour, just spelled out.
		private readonly shape: FakeShape
		constructor(shape: FakeShape) { this.shape = shape }
		// tldraw's `TextShapeUtil.isAspectRatioLocked()` returns true
		// unconditionally, which is what routes a text resize through
		// `resizeScaled` — moving `props.scale` and never `props.w`.
		isAspectRatioLocked() { return this.shape.type === 'text' }
	}
	if (paintSeam) markResolvesPrimitiveOverrides(FakePaintUtil)
	const editor = {
		getSelectedShapes: () => shapes as unknown as TLShape[],
		getShape: (id: string) => shapes.find((shape) => shape.id === id) as unknown as TLShape | undefined,
		// The real `Editor.isShapeOrAncestorLocked` also walks the parent chain;
		// the fixture is flat, so its own flag is the whole answer here. The
		// ancestor case is proven against a real editor in the browser journey.
		isShapeOrAncestorLocked: (shape: FakeShape) => shape.isLocked,
		getShapeUtil: (shape: FakeShape) => new FakePaintUtil(shape),
		getShapePageBounds: (shape: FakeShape) => ({
			x: 10, y: 20,
			w: (shape.props.w as number) ?? 0,
			h: (shape.props.h as number) ?? 0,
		}),
		getCurrentTheme: () => ({ colors: { light: { black: { solid: '#1d1d1d' } } } }),
		getColorMode: () => 'light',
		markHistoryStoppingPoint: (name: string) => { calls.marks.push(name) },
		// A style row records the choice for the next shape drawn — the second of
		// the two calls tldraw's own style bar makes.
		setStyleForNextShapes: (style: { id: string }, value: string) => {
			calls.nextStyles.push([style.id, value])
		},
		updateShapes: (partials: Array<Record<string, unknown>>) => {
			calls.updates.push(...partials)
			// Applied to the fixture so a follow-up read sees the write — and
			// applied the way the REAL editor applies it. `props` and `meta` are
			// MERGED key by key (`applyPartialToRecordWithProps` in tldraw's
			// `Editor.ts`), never replaced. An earlier version of this fixture
			// replaced `meta`, which made `delete`-to-clear pass here and do
			// nothing in the browser. The fixture is only useful as an oracle
			// while it copies this exactly.
			for (const partial of partials) {
				const target = shapes.find((candidate) => candidate.id === partial.id)
				if (!target) continue
				if (partial.props) Object.assign(target.props, partial.props)
				if (partial.meta) Object.assign(target.meta, partial.meta)
				if (partial.rotation !== undefined) target.rotation = partial.rotation as number
				if (partial.isLocked !== undefined) target.isLocked = partial.isLocked as boolean
				if (partial.opacity !== undefined) target.opacity = partial.opacity as number
			}
		},
		resizeShape: () => {},
		zoomToSelection: () => {},
	}
	return { editor: editor as unknown as Editor, calls }
}

function controlIds(model: PrimitiveInspectorModel): string[] {
	return model.groups.flatMap((group) => group.controls.map((control) => control.id))
}

function find(model: PrimitiveInspectorModel, id: string) {
	return controlIds(model).includes(id)
		? model.groups.flatMap((group) => group.controls).find((control) => control.id === id)!
		: undefined
}

describe('getPrimitiveInspectorModel', () => {
	it('returns null when nothing is selected', () => {
		expect(getPrimitiveInspectorModel(fakeEditor([]).editor)).toBeNull()
	})

	it('names a geo shape by its geometry, not by the record type', () => {
		const model = getPrimitiveInspectorModel(fakeEditor([geo('a', { geo: 'hexagon' })]).editor)!
		expect(model.title).toBe('hexagon')
		expect(model.types).toEqual(['geo'])
	})

	it('offers a rectangle far more than the stock style bar does', () => {
		const model = getPrimitiveInspectorModel(fakeEditor([geo('a')]).editor)!
		const ids = controlIds(model)
		for (const id of [
			'x', 'y', 'w', 'h', 'rotation', 'opacity', 'isLocked',
			'geo', 'flipX', 'flipY', 'scale', 'cornerRadius',
			'fill', 'color', 'fillColor', 'fillOpacity',
			'dash', 'size', 'strokeColor', 'strokeWidth', 'strokeRoundness',
			'font', 'align', 'verticalAlign', 'labelColorProp', 'labelColor',
			'labelFontFamily', 'labelFontSize', 'labelLineHeight',
			'labelPadding', 'textOutline',
		]) {
			expect(ids, `missing ${id}`).toContain(id)
		}
	})

	it('offers weight and italic only where tldraw actually reads them', () => {
		// They appear in tldraw's whole shipped renderer at their two DECLARATION
		// sites and nowhere else; only `TextShapeUtil` reads its own `fontWeight`
		// and `fontStyle`. On a geo they wrote meta and changed nothing.
		expect(controlIds(getPrimitiveInspectorModel(fakeEditor([geo('a')]).editor)!))
			.not.toContain('labelFontWeight')
		const text = {
			id: 'shape:t', type: 'text', rotation: 0, opacity: 1, isLocked: false, meta: {},
			props: {
				color: 'black', size: 'm', font: 'draw', textAlign: 'start', w: 8,
				richText: { type: 'doc' }, scale: 1, autoSize: true,
			},
		}
		const ids = controlIds(getPrimitiveInspectorModel(fakeEditor([text]).editor)!)
		expect(ids).toContain('labelFontWeight')
		expect(ids).toContain('labelFontStyle')
		// ...and W is NOT offered, because a text shape resizes by `scale`.
		expect(ids).not.toContain('w')
	})

	it('drops the sticky ring rows, which the engine paints only when zoomed out', () => {
		expect(controlIds(getPrimitiveInspectorModel(fakeEditor([note('n')]).editor)!))
			.not.toContain('noteBorderWidth')
	})

	it('offers corner roundness only on the dash tldraw rounds', () => {
		expect(controlIds(getPrimitiveInspectorModel(fakeEditor([geo('a', { dash: 'solid' })]).editor)!))
			.not.toContain('strokeRoundness')
		expect(controlIds(getPrimitiveInspectorModel(fakeEditor([geo('a', { dash: 'draw' })]).editor)!))
			.toContain('strokeRoundness')
	})

	it('clears a corner radius when the rectangle tile un-rounds the shape', () => {
		const shape = geo('a')
		const { editor } = fakeEditor([shape])
		applyPrimitiveInspectorControl(editor, 'cornerRadius', 40)
		expect(shape.props.geo).toBe('systemsketch-rounded-rect')
		// `read` maps the rounded rectangle to `rectangle`, so this IS the tile a
		// person clicks to un-round — and it used to skip the cleanup.
		applyPrimitiveInspectorControl(editor, 'geo', 'rectangle')
		expect(hasPrimitiveOverride(shape)).toBe(false)
	})

	it('offers Unlock when ANY selected shape is locked, not only when all are', () => {
		const open = geo('a')
		const shut = geo('b', {}, { isLocked: true })
		const { editor } = fakeEditor([open, shut])
		expect(getPrimitiveInspectorModel(editor)!.locked).toBe(true)
	})

	it('drops a row no selected shape claims', () => {
		const ids = controlIds(getPrimitiveInspectorModel(fakeEditor([geo('a')]).editor)!)
		// A control that does nothing is a lie, so arrow and note rows are absent.
		expect(ids).not.toContain('arrowheadEnd')
		expect(ids).not.toContain('noteWidth')
		expect(ids).not.toContain('spline')
	})

	it('hides the two custom geometries from the picker', () => {
		const model = getPrimitiveInspectorModel(fakeEditor([geo('a')]).editor)!
		const values = find(model, 'geo')!.options!.map((option) => option.value)
		expect(values).toHaveLength(20)
		expect(values).not.toContain('systemsketch-rounded-rect')
		expect(values).not.toContain('excalidraw-rounded-rect')
	})

	it('reads null — the panel’s Mixed — when the selection disagrees', () => {
		const { editor } = fakeEditor([geo('a', { fill: 'none' }), geo('b', { fill: 'solid' })])
		const model = getPrimitiveInspectorModel(editor)!
		expect(find(model, 'fill')!.value).toBeNull()
		expect(find(model, 'dash')!.value).toBe('draw')
	})

	it('offers a row when only one shape of a mixed selection claims it', () => {
		const ids = controlIds(getPrimitiveInspectorModel(fakeEditor([geo('a'), arrow('b')]).editor)!)
		expect(ids).toContain('arrowheadEnd')
		expect(ids).toContain('geo')
	})

	it('marks a row that is holding an override, and only that row', () => {
		const shape = geo('a')
		shape.meta = { [KEY]: { strokeWidth: 8 } }
		const model = getPrimitiveInspectorModel(fakeEditor([shape]).editor)!
		expect(find(model, 'strokeWidth')!.overridden).toBe(true)
		expect(find(model, 'strokeColor')!.overridden).toBeUndefined()
		expect(model.hasOverrides).toBe(true)
	})

	it('gives a still-auto scrub row tldraw’s own value as its origin', () => {
		// Without this the first drag on an untouched Fill alpha starts at the
		// field's minimum and slams the shape to fully transparent.
		const model = getPrimitiveInspectorModel(fakeEditor([geo('a', { fill: 'solid' })]).editor)!
		const alpha = find(model, 'fillOpacity')!
		expect(alpha.unset).toBe(true)
		expect(alpha.fallback).toBe(1)
	})

	it('reports the halo as on until it is switched off', () => {
		expect(find(getPrimitiveInspectorModel(fakeEditor([geo('a')]).editor)!, 'textOutline')!.value)
			.toBe(true)
	})

	it('hides bend on an elbow arrow and the elbow midpoint on an arc', () => {
		const arc = controlIds(getPrimitiveInspectorModel(fakeEditor([arrow('a')]).editor)!)
		expect(arc).toContain('bend')
		expect(arc).not.toContain('elbowMidPoint')
		const elbow = controlIds(getPrimitiveInspectorModel(fakeEditor([arrow('a', { kind: 'elbow' })]).editor)!)
		expect(elbow).not.toContain('bend')
		expect(elbow).toContain('elbowMidPoint')
	})
})

describe('rows that would have been inert', () => {
	it('drops the palette on a frame, whose colour tldraw does not register as a style', () => {
		// `setStyleForSelectedShapes` silently skips a prop with no style key, so
		// the swatch row was a control that could never do anything.
		const ids = controlIds(getPrimitiveInspectorModel(fakeEditor([frame('f')]).editor)!)
		expect(ids).not.toContain('color')
		expect(ids).toContain('frameName')
	})

	it('drops the halo row on a sticky, which never had one', () => {
		// `NoteShapeUtil` passes `showTextOutline={false}` as a literal. The row
		// reported the opposite of the canvas and then changed nothing.
		const ids = controlIds(getPrimitiveInspectorModel(fakeEditor([note('n')]).editor)!)
		expect(ids).not.toContain('textOutline')
		expect(ids).toContain('noteWidth')
	})

	it('still offers the halo on a geo, which does have one', () => {
		expect(controlIds(getPrimitiveInspectorModel(fakeEditor([geo('a')]).editor)!))
			.toContain('textOutline')
	})

	it('offers an arbitrary font stack — the row the four-family picker cannot reach', () => {
		expect(controlIds(getPrimitiveInspectorModel(fakeEditor([geo('a')]).editor)!))
			.toContain('labelFontFamily')
	})

	it('reports a shape locked by an ancestor as locked', () => {
		// `updateShapes` skips a shape whose ancestor is locked, so reading only
		// `isLocked` gave a fully live panel in which nothing worked and no
		// Unlock button appeared.
		const child = geo('child')
		const { editor } = fakeEditor([child])
		;(editor as unknown as { isShapeOrAncestorLocked(shape: unknown): boolean })
			.isShapeOrAncestorLocked = () => true
		expect(getPrimitiveInspectorModel(editor)!.locked).toBe(true)
	})
})

describe('geometry and size read what they write', () => {
	it('reads the shape’s own width, not its rotated page box', () => {
		// Reading the page AABB while writing through `resizeShape` (which scales
		// in shape space) meant typing 200 into W on a 45° rectangle committed
		// 141 and redisplayed 171.
		const rotated = geo('a', { w: 300, h: 200 }, { rotation: Math.PI / 4 })
		const model = getPrimitiveInspectorModel(fakeEditor([rotated]).editor)!
		expect(find(model, 'w')!.value).toBe(300)
		expect(find(model, 'h')!.value).toBe(200)
	})

	it('drops a stale corner radius when the geometry stops having corners', () => {
		const shape = geo('a')
		const { editor } = fakeEditor([shape])
		applyPrimitiveInspectorControl(editor, 'cornerRadius', 40)
		expect(shape.meta[KEY]).toEqual({ cornerRadius: 40 })
		applyPrimitiveInspectorControl(editor, 'geo', 'ellipse')
		// Without this the radius came back — reading 40, wearing its overridden
		// dot — the moment the shape returned to a rectangle, over hard corners.
		expect(hasPrimitiveOverride(shape)).toBe(false)
	})

	it('shows a rounded rectangle as `rectangle` in the geometry grid', () => {
		const shape = geo('a', { geo: 'systemsketch-rounded-rect' })
		const model = getPrimitiveInspectorModel(fakeEditor([shape]).editor)!
		expect(find(model, 'geo')!.value).toBe('rectangle')
	})
})

describe('applyPrimitiveInspectorControl', () => {
	it('writes a style row to the named shapes AND records it for the next shape', () => {
		// tldraw's own style bar makes both calls. The direct write is fenced to
		// the shapes the row was showing (not `getSelectedShapes()`), and
		// `setStyleForNextShapes` is what the panel header's "inherited by the
		// next shape you draw" promise actually rests on.
		const shape = geo('a')
		const { editor, calls } = fakeEditor([shape])
		applyPrimitiveInspectorControl(editor, 'fill', 'solid')
		expect(calls.updates).toEqual([{ id: 'shape:a', type: 'geo', props: { fill: 'solid' } }])
		expect(calls.nextStyles).toEqual([['tldraw:fill', 'solid']])
		expect(shape.props.fill).toBe('solid')
	})

	it('writes opacity to the shapes the row was showing, not the live selection', () => {
		// §2.2: `setOpacityForSelectedShapes` read the live selection, so a value
		// typed and committed on blur landed on whatever the click selected next.
		const a = geo('a')
		const b = geo('b')
		const { editor, calls } = fakeEditor([a, b])
		// The panel is showing A; the selection has already moved to B.
		;(editor as unknown as { getSelectedShapes(): unknown[] }).getSelectedShapes = () => [b]
		applyPrimitiveInspectorControl(editor, 'opacity', 20, { shapeIds: ['shape:a'] })
		expect(calls.updates).toEqual([{ id: 'shape:a', type: 'geo', opacity: 0.2 }])
		expect(a.opacity).toBe(0.2)
		expect(b.opacity).toBe(1)
	})

	it('accepts any opacity between the five stock presets', () => {
		const shape = geo('a')
		const { editor } = fakeEditor([shape])
		applyPrimitiveInspectorControl(editor, 'opacity', 6)
		expect(shape.opacity).toBe(0.06)
	})

	it('writes only the shapes that claim the row', () => {
		const shapes = [geo('a'), arrow('b')]
		const { editor, calls } = fakeEditor(shapes)
		applyPrimitiveInspectorControl(editor, 'flipX', true)
		expect(calls.updates.map((update) => update.id)).toEqual(['shape:a'])
	})

	it('marks one history stopping point per gesture, not per frame', () => {
		const { editor, calls } = fakeEditor([geo('a')])
		applyPrimitiveInspectorControl(editor, 'strokeWidth', 3, { mark: true })
		applyPrimitiveInspectorControl(editor, 'strokeWidth', 4, { mark: false })
		applyPrimitiveInspectorControl(editor, 'strokeWidth', 5, { mark: false })
		expect(calls.marks).toEqual(['inspector strokeWidth'])
	})

	it('ignores an id no field owns', () => {
		const { editor, calls } = fakeEditor([geo('a')])
		applyPrimitiveInspectorControl(editor, 'nonexistent', 1)
		expect(calls.marks).toEqual([])
		expect(calls.updates).toEqual([])
	})
})

describe('corner radius', () => {
	it('switches a rectangle onto the registered rounded geometry and back', () => {
		const shape = geo('a')
		const { editor } = fakeEditor([shape])
		applyPrimitiveInspectorControl(editor, 'cornerRadius', 24)
		expect(shape.props.geo).toBe('systemsketch-rounded-rect')
		expect(shape.meta[KEY]).toEqual({ cornerRadius: 24 })

		// Zero has to leave the record on the plain stock rectangle: a round
		// trip through the control must not strand a non-stock geometry.
		applyPrimitiveInspectorControl(editor, 'cornerRadius', 0)
		expect(shape.props.geo).toBe('rectangle')
		expect(shape.meta[KEY]).toBeNull()
		expect(hasPrimitiveOverride(shape)).toBe(false)
	})

	it('is not offered for a geometry that has no corners to round', () => {
		const ids = controlIds(getPrimitiveInspectorModel(fakeEditor([geo('a', { geo: 'ellipse' })]).editor)!)
		expect(ids).not.toContain('cornerRadius')
	})
})

describe('the halo toggle', () => {
	it('stores only the off state, because on is tldraw’s own behaviour', () => {
		const shape = geo('a')
		const { editor } = fakeEditor([shape])
		applyPrimitiveInspectorControl(editor, 'textOutline', false)
		expect(shape.meta[KEY]).toEqual({ textOutline: false })
		applyPrimitiveInspectorControl(editor, 'textOutline', true)
		expect(shape.meta[KEY]).toBeNull()
		expect(hasPrimitiveOverride(shape)).toBe(false)
	})
})

describe('clearing', () => {
	it('puts one row back without touching its neighbours', () => {
		const shape = geo('a')
		shape.meta = { [KEY]: { strokeWidth: 8, fillOpacity: 0.3 } }
		const { editor } = fakeEditor([shape])
		clearPrimitiveInspectorControl(editor, 'strokeWidth')
		expect(shape.meta[KEY]).toEqual({ fillOpacity: 0.3 })
	})

	it('resets every override and leaves the stock props alone', () => {
		const shape = geo('a', { fill: 'solid' })
		shape.meta = { [KEY]: { strokeWidth: 8, fillOpacity: 0.3 }, keepMe: true }
		const { editor } = fakeEditor([shape])
		resetPrimitiveOverrides(editor)
		expect(shape.meta[KEY]).toBeNull()
		expect(hasPrimitiveOverride(shape)).toBe(false)
		expect(shape.meta.keepMe).toBe(true)
		expect(shape.props.fill).toBe('solid')
	})

	it('clears the row on the shape the panel showed, not the one selected by the blur', () => {
		// §2.3: `ColorField` calls `onClear` on blur, after the click that moved
		// the selection. Without the fence, emptying A's Stroke cleared B's.
		const a = geo('a')
		const b = geo('b')
		a.meta = { [KEY]: { strokeColor: '#e0218a' } }
		b.meta = { [KEY]: { strokeColor: '#0000ff' } }
		const { editor } = fakeEditor([a, b])
		;(editor as unknown as { getSelectedShapes(): unknown[] }).getSelectedShapes = () => [b]
		clearPrimitiveInspectorControl(editor, 'strokeColor', ['shape:a'])
		expect(hasPrimitiveOverride(a)).toBe(false)
		expect(hasPrimitiveOverride(b)).toBe(true)
	})

	it('resets only the shapes the panel showed, not the live selection', () => {
		const a = geo('a')
		const b = geo('b')
		a.meta = { [KEY]: { strokeWidth: 8 } }
		b.meta = { [KEY]: { strokeWidth: 8 } }
		const { editor } = fakeEditor([a, b])
		;(editor as unknown as { getSelectedShapes(): unknown[] }).getSelectedShapes = () => [b]
		resetPrimitiveOverrides(editor, ['shape:a'])
		expect(hasPrimitiveOverride(a)).toBe(false)
		expect(hasPrimitiveOverride(b)).toBe(true)
	})
})

describe('the bare stock canvas (no configured paint seam)', () => {
	// §2.1: `?stock-inspector` mounts `<Tldraw />` with no util configured to
	// resolve `meta` overrides, so a `paint` row there would write state and
	// paint nothing. Same field list, one predicate — the rows simply drop.
	const bare = (shape: FakeShape) => getPrimitiveInspectorModel(fakeEditor([shape], { paintSeam: false }).editor)!

	it('drops every paint row a rectangle would otherwise get', () => {
		const ids = controlIds(bare(geo('a', { fill: 'solid', dash: 'draw' })))
		for (const paintRow of [
			'fillColor', 'fillOpacity', 'strokeColor', 'strokeWidth', 'strokeRoundness',
			'labelColor', 'labelFontFamily', 'labelFontSize', 'labelLineHeight',
			'labelPadding', 'textOutline', 'cornerRadius',
		]) {
			expect(ids, `paint row ${paintRow} must not reach the bare canvas`).not.toContain(paintRow)
		}
	})

	it('still offers the stock style and prop rows, which reach bare tldraw', () => {
		const ids = controlIds(bare(geo('a')))
		for (const stockRow of ['x', 'y', 'w', 'h', 'opacity', 'geo', 'fill', 'color', 'dash', 'size', 'font']) {
			expect(ids, `stock row ${stockRow}`).toContain(stockRow)
		}
	})

	it('keeps both routes one field list — the app route still has the paint rows', () => {
		expect(controlIds(getPrimitiveInspectorModel(fakeEditor([geo('a', { fill: 'solid' })]).editor)!))
			.toContain('fillColor')
	})

	it('refuses to write a paint value through applyPrimitiveInspectorControl there', () => {
		const shape = geo('a')
		const { editor } = fakeEditor([shape], { paintSeam: false })
		applyPrimitiveInspectorControl(editor, 'strokeColor', '#e0218a')
		expect(hasPrimitiveOverride(shape)).toBe(false)
	})
})

describe('style rows honour the shape fence', () => {
	it('writes a segmented style row to the shapes the panel showed, not the selection', () => {
		const a = geo('a', { fill: 'none' })
		const b = geo('b', { fill: 'none' })
		const { editor } = fakeEditor([a, b])
		;(editor as unknown as { getSelectedShapes(): unknown[] }).getSelectedShapes = () => [b]
		applyPrimitiveInspectorControl(editor, 'fill', 'solid', { shapeIds: ['shape:a'] })
		expect(a.props.fill).toBe('solid')
		expect(b.props.fill).toBe('none')
	})

	it('routes the Geometry tile the same way, and still records the next-shape style', () => {
		const shape = geo('a')
		const { editor, calls } = fakeEditor([shape])
		applyPrimitiveInspectorControl(editor, 'geo', 'hexagon')
		expect(shape.props.geo).toBe('hexagon')
		expect(calls.nextStyles).toContainEqual(['tldraw:geo', 'hexagon'])
	})
})

describe('primitiveInspectorKey', () => {
	it('is null for an empty selection and stable for an unchanged reading', () => {
		expect(primitiveInspectorKey(null)).toBeNull()
		const a = getPrimitiveInspectorModel(fakeEditor([geo('a')]).editor)
		const b = getPrimitiveInspectorModel(fakeEditor([geo('a')]).editor)
		expect(primitiveInspectorKey(a)).toBe(primitiveInspectorKey(b))
	})

	it('changes when a value the panel draws moves', () => {
		const before = primitiveInspectorKey(getPrimitiveInspectorModel(fakeEditor([geo('a')]).editor))
		const after = primitiveInspectorKey(
			getPrimitiveInspectorModel(fakeEditor([geo('a', { fill: 'solid' })]).editor),
		)
		expect(before).not.toBe(after)
	})
})
