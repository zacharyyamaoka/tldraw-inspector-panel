import {
	DefaultContextMenu,
	DefaultContextMenuContent,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	useEditor,
	useValue,
	type TLShape,
	type TLShapePartial,
} from 'tldraw'
import { clearPrimitiveOverride, hasPrimitiveOverride } from '../inspector/overrides'

/**
 * The canvas context menu, with one item added above tldraw's own.
 *
 * "Detach to primitive" strips a shape's `meta.primitiveOverride` — every exact
 * colour, width, radius and typography value this app paints — leaving the
 * record exactly as it already was and the shape rendering exactly as stock
 * tldraw would render it.
 *
 * WHY this is worth a menu item rather than "just clear the fields in the
 * panel": Zach's own reason — "this is helpful for seeing what stock would look
 * like within the current board". The Stock check answers that question for the
 * WHOLE board in a separate view; this answers it for one shape, in place,
 * beside the shapes it is being compared against. It is also the honest inverse
 * of the architecture: if all our richness lives in meta, then removing meta
 * has to be one action, not a tour of the inspector.
 *
 * It is deliberately UNDOABLE and deliberately not a "reset" of anything else —
 * props, position and geometry are untouched, because those were always stock.
 */
export function LabContextMenu() {
	const editor = useEditor()

	// `useValue` so the item appears and disappears with the selection rather
	// than only when the menu is remounted.
	const detachableCount = useValue(
		'detachable shapes',
		() => editor.getSelectedShapes().filter((shape) => hasPrimitiveOverride(shape as TLShape)).length,
		[editor],
	)

	return (
		<DefaultContextMenu>
			{detachableCount > 0 ? (
				<TldrawUiMenuGroup id="lab-detach">
					<TldrawUiMenuItem
						id="detach-to-primitive"
						label={detachableCount > 1 ? `Detach ${detachableCount} to primitives` : 'Detach to primitive'}
						onSelect={() => {
							const shapes = editor.getSelectedShapes().filter((shape) => hasPrimitiveOverride(shape as TLShape))
							if (shapes.length === 0) return
							editor.markHistoryStoppingPoint('detach to primitive')
							// The cast mirrors inspectorModel.ts's own `updateShapes` helper:
							// tldraw's partial is discriminated on `type`, and a write over a
							// heterogeneous selection cannot be expressed in that union.
							editor.updateShapes(shapes.map((shape) => ({
								id: shape.id,
								type: shape.type,
								meta: clearPrimitiveOverride(shape as TLShape),
							})) as unknown as TLShapePartial[])
						}}
					/>
				</TldrawUiMenuGroup>
			) : null}
			<DefaultContextMenuContent />
		</DefaultContextMenu>
	)
}
