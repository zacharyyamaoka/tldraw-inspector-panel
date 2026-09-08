import { describe, expect, it } from 'vitest'

import {
	PRIMITIVE_OVERRIDE_META_KEY as KEY,
	arrowOverrideDisplayValues,
	clearPrimitiveOverride,
	geoOverrideDisplayValues,
	hasPrimitiveOverride,
	highlightOverrideDisplayValues,
	noteOverrideDisplayValues,
	primitiveOverrideStyle,
	readPrimitiveOverride,
	writePrimitiveOverride,
} from './overrides'

function shape(override: Record<string, unknown>, props: Record<string, unknown> = {}) {
	return { type: 'geo', props, meta: { [KEY]: override } }
}

describe('readPrimitiveOverride', () => {
	it('returns an empty record for a shape that has never been touched', () => {
		expect(readPrimitiveOverride({ meta: {} })).toEqual({})
		expect(hasPrimitiveOverride({ meta: {} })).toBe(false)
	})

	it('drops values of the wrong type rather than handing them to the renderer', () => {
		const read = readPrimitiveOverride(shape({
			strokeWidth: 'thick',
			strokeColor: 42,
			labelFontSize: Number.NaN,
			textOutline: 'no',
			fillOpacity: 0.4,
		}))
		expect(read).toEqual({ fillOpacity: 0.4 })
	})
})

describe('writePrimitiveOverride', () => {
	it('merges one field and leaves the rest of the meta bag alone', () => {
		const before = { other: 'kept', [KEY]: { strokeWidth: 4 } }
		const after = writePrimitiveOverride({ meta: before }, { fillOpacity: 0.5 })
		expect(after.other).toBe('kept')
		expect(after[KEY]).toEqual({ strokeWidth: 4, fillOpacity: 0.5 })
	})

	it('nulls the key once the last override is cleared, rather than deleting it', () => {
		// tldraw MERGES `meta` key by key, so a deleted key is an untouched key.
		// Writing null is what actually clears it — and every reader treats null
		// as absent, which is the contract the two assertions below pin.
		const after = writePrimitiveOverride(shape({ strokeWidth: 4 }), { strokeWidth: undefined })
		expect(after[KEY]).toBeNull()
		expect(readPrimitiveOverride({ meta: after })).toEqual({})
		expect(hasPrimitiveOverride({ meta: after })).toBe(false)
	})

	it('clearing every override leaves a record that reads as untouched', () => {
		const after = clearPrimitiveOverride(shape({ strokeWidth: 4, fillOpacity: 0.2 }))
		expect(after[KEY]).toBeNull()
		expect(hasPrimitiveOverride({ meta: after })).toBe(false)
	})

	it('removes one field from inside the record, which the merge does replace', () => {
		const after = writePrimitiveOverride(
			shape({ strokeWidth: 4, fillOpacity: 0.2 }),
			{ strokeWidth: undefined },
		)
		expect(after[KEY]).toEqual({ fillOpacity: 0.2 })
	})
})

describe('display values', () => {
	it('rides strokeRoundness along with an overridden width', () => {
		// tldraw defines roundness as strokeWidth * 2, so a width set without it
		// would round a `draw` outline for a thickness it is no longer drawn at.
		expect(geoOverrideDisplayValues(shape({ strokeWidth: 6 }))).toMatchObject({
			strokeWidth: 6,
			strokeRoundness: 12,
		})
	})

	it('lets an explicit roundness outrank the derived one', () => {
		expect(geoOverrideDisplayValues(shape({ strokeWidth: 6, strokeRoundness: 40 })))
			.toMatchObject({ strokeWidth: 6, strokeRoundness: 40 })
	})

	it('divides by the shape scale so the number on the panel is the one on screen', () => {
		// tldraw multiplies the display value by `scale`, and this app moves
		// `scale` to reach an exact font size.
		expect(geoOverrideDisplayValues(shape({ strokeWidth: 6 }, { scale: 2 })))
			.toMatchObject({ strokeWidth: 3 })
	})

	it('composites a fill alpha onto the fill the app already resolved', () => {
		const values = geoOverrideDisplayValues(shape({ fillOpacity: 0.25 }), '#ff0000')
		expect(values.fillColor).toBe('color-mix(in srgb, #ff0000 25%, transparent)')
	})

	it('leaves the fill alone when neither a colour nor an alpha is set', () => {
		expect(geoOverrideDisplayValues(shape({ strokeWidth: 2 }), '#ff0000').fillColor).toBeUndefined()
	})

	it('carries the arrow label plate and the note ring on their own shapes', () => {
		expect(arrowOverrideDisplayValues(shape({ arrowLabelRadius: 0 })))
			.toMatchObject({ labelBorderRadius: 0 })
		expect(noteOverrideDisplayValues(shape({ noteBorderWidth: 0, noteWidth: 320 })))
			.toMatchObject({ borderWidth: 0, noteWidth: 320 })
		expect(highlightOverrideDisplayValues(shape({ highlightOverlayOpacity: 1 })))
			.toMatchObject({ overlayOpacity: 1 })
	})

	it('emits no key at all for a field that was never set', () => {
		// A spread of `{ fillColor: undefined }` would blank tldraw's own answer.
		expect(Object.keys(geoOverrideDisplayValues(shape({})))).toEqual([])
	})
})

describe('primitiveOverrideStyle', () => {
	it('contributes nothing while the halo is at tldraw’s own setting', () => {
		expect(primitiveOverrideStyle(shape({}))).toBeNull()
		expect(primitiveOverrideStyle(shape({ textOutline: true }))).toBeNull()
	})

	it('switches off the background-coloured text halo', () => {
		expect(primitiveOverrideStyle(shape({ textOutline: false }))).toMatchObject({
			'--tl-text-outline': 'none',
			display: 'contents',
		})
	})
})
