/**
 * V7's mount point — the same shape as `FigmaAnatomyView` (header, scroll
 * area, remount-on-selection key) so the dock chrome around it is unchanged
 * and only the BODY differs.
 *
 * WHY it keeps `data-testid="inspector-panel"` and the `key={shapeIds}`
 * remount: both are load-bearing contracts the rest of the app already
 * relies on — the drawer's own journey finds the panel by that id, and the
 * key is judge-round-2 finding 7's fix (a stale `useAnatomyCtx` ref carrying
 * one shape's fill style into another's eye toggle). A new variant is not a
 * reason to re-derive either.
 */
import type { Editor } from 'tldraw'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { InspectorValue, PrimitiveInspectorModel } from '../../inspectorModel'
import { useAnatomyCtx } from '../figmaKit'
import { FigmaExactPanel } from './FigmaExactPanel'

/**
 * The words Figma prints as the node type. tldraw's own shape types map onto
 * Figma's vocabulary almost one-for-one; `geo` is the one that does not,
 * because tldraw calls every closed primitive `geo` and puts the real name in
 * `props.geo` ("rectangle", "ellipse", …). Figma would print that inner name,
 * so this does too — Title Case, its own convention.
 */
function nodeTypeLabel(model: PrimitiveInspectorModel): string {
	if (model.shapeIds.length > 1) return `${model.shapeIds.length} layers`
	const raw = model.title || 'Layer'
	return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function FigmaExactView({ model, editor, onChange, onClear }: {
	model: PrimitiveInspectorModel | null
	editor: Editor
	onChange(id: string, value: InspectorValue, gestureStart: boolean): void
	onClear(id: string): void
}) {
	return (
		<div data-testid="inspector-panel" data-figma-exact="" className="flex h-full flex-col">
			<ScrollArea className="min-h-0 flex-1">
				{model ? (
					<FigmaExactBody key={model.shapeIds.join(',')} model={model} editor={editor} onChange={onChange} onClear={onClear} />
				) : (
					<p className="p-4 text-[11px] text-[var(--fig-text-secondary)]">Select something to inspect it.</p>
				)}
			</ScrollArea>
		</div>
	)
}

function FigmaExactBody({ model, editor, onChange, onClear }: {
	model: PrimitiveInspectorModel
	editor: Editor
	onChange(id: string, value: InspectorValue, gestureStart: boolean): void
	onClear(id: string): void
}) {
	const ctx = useAnatomyCtx(model, editor, onChange, onClear)
	return <FigmaExactPanel ctx={ctx} nodeType={nodeTypeLabel(model)} />
}
