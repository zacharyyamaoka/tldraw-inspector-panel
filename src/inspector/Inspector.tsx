/**
 * The Figma-shaped right inspector, mounted through tldraw's own
 * `components={{ StylePanel: Inspector }}` seam (see `src/board/mount.tsx`).
 *
 * Nothing here knows what a shape *can be* — `inspectorModel.ts` answers that,
 * once, and this file only draws whatever it hands back. Every part below is
 * a shadcn/Base UI primitive except two, called out where they live: the
 * swatch grid (there is no shadcn swatch grid, and painting one from the live
 * theme is the feature) and `ScrubNumber`'s numeric expression parser (a board
 * is a document other people can send you, so it is never `eval`).
 *
 * Ported behaviour, not ported file: `DefaultStylePanel.tsx` (stock tldraw,
 * `node_modules/tldraw/src/lib/ui/components/StylePanel/DefaultStylePanel.tsx`)
 * is the reference for the three things every replacement style panel must
 * still do — `usePassThroughWheelEvents`, `editor.markEventAsHandled` on
 * pointermove (never `stopPropagation`, which breaks a slider's own pointer
 * capture), and Escape returning focus to `editor.getContainer()`.
 */
import { useEffect, useRef, useState } from 'react'
import {
	useEditor,
	usePassThroughWheelEvents,
	useValue,
	type Editor,
	type TLUiStylePanelProps,
} from 'tldraw'
import { ChevronRight } from 'lucide-react'
import { HexAlphaColorPicker } from 'react-colorful'

import { Button } from '@/components/ui/button'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from 'cn'

import { GEO_GLYPHS, STROKED_GLYPHS } from './glyphs'
import {
	applyPrimitiveInspectorControl,
	clearPrimitiveInspectorControl,
	getPrimitiveInspectorModel,
	primitiveInspectorKey,
	resetPrimitiveOverrides,
	unlockPrimitiveInspectorSelection,
	type InspectorControl,
	type InspectorGroup,
	type InspectorValue,
	type PrimitiveInspectorModel,
} from './inspectorModel'
import { ScrubNumber } from './ScrubNumber'
import { ThemePanel } from './ThemePanel'

/** `CSS.supports` is the only honest oracle for "will the engine paint this" —
 *  the field accepts `rgba(...)`, `transparent` and `color-mix(...)` as well
 *  as hex, so a regex would reject values the engine happily paints.
 *  Exported for `ThemePanel.tsx`'s own colour rows — same validation, same
 *  reasoning, one function. */
export function isColor(value: string): boolean {
	if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true
	return CSS.supports('color', value)
}

function Glyph({ name, path, viewBox }: { name?: string; path?: string; viewBox?: string }) {
	const drawn = path ?? (name ? GEO_GLYPHS[name] : undefined)
	if (!drawn) return <span className="text-[10px] text-muted-foreground">{name?.slice(0, 2)}</span>
	return (
		<svg
			viewBox={viewBox ?? '0 0 24 24'}
			aria-hidden="true"
			className={cn('size-4', name && STROKED_GLYPHS.has(name) ? 'fill-none stroke-current stroke-[1.5]' : 'fill-current')}
		>
			<path d={drawn} />
		</svg>
	)
}

/** No shadcn swatch grid exists, and painting each cell from the live tldraw
 *  theme (`option.swatch`, resolved by the model) is the feature — the one
 *  hand-rolled control the plan calls for besides the number parser. */
function SwatchGrid({ control, onChange }: { control: InspectorControl; onChange(value: InspectorValue): void }) {
	return (
		<div className="grid grid-cols-7 gap-1" role="group" aria-label={control.label}>
			{(control.options ?? []).map((option) => (
				<Toggle
					key={option.value}
					pressed={control.value === option.value}
					aria-label={option.label}
					title={option.label}
					data-testid={`inspector-swatch-${control.id}-${option.value}`}
					className="size-6 rounded-full border border-border p-0 data-[state=on]:ring-2 data-[state=on]:ring-ring"
					style={{ background: option.swatch }}
					onPressedChange={() => onChange(option.value)}
				/>
			))}
		</div>
	)
}

function TileGroup({ control, onChange }: { control: InspectorControl; onChange(value: InspectorValue): void }) {
	const current = typeof control.value === 'string' ? control.value : undefined
	return (
		<TooltipProvider>
			<ToggleGroup
				value={current ? [current] : []}
				onValueChange={(next) => { if (next[0] !== undefined) onChange(next[0]) }}
				className="flex-wrap"
				aria-label={control.label}
			>
				{(control.options ?? []).map((option) => (
					<Tooltip key={option.value}>
						<TooltipTrigger
							render={
								<ToggleGroupItem
									value={option.value}
									aria-label={option.label}
									data-testid={`inspector-tile-${control.id}-${option.value}`}
									size="sm"
									// WHY `text-foreground` here rather than leaving the glyph to
									// inherit it: a `<button>` does not inherit `color` from its
									// DOM ancestor the way ordinary elements do (the UA stylesheet
									// gives it its own `ButtonText` system colour), so the SVG's
									// `fill-current`/`stroke-current` (Glyph, below) resolved to
									// black regardless of theme until this was explicit — dark
									// mode painted black glyphs on dark grey. No separate pressed
									// colour: shadcn's own Toggle only changes the background
									// (`data-[state=on]:bg-muted`) and leaves text colour alone, so
									// matching that is "whatever the shadcn toggle already does"
									// rather than a third scheme.
									className="size-7 p-0 text-foreground"
								/>
							}
						>
							<Glyph name={option.value} path={option.path} viewBox={option.viewBox} />
						</TooltipTrigger>
						<TooltipContent>{option.label}</TooltipContent>
					</Tooltip>
				))}
			</ToggleGroup>
		</TooltipProvider>
	)
}

/**
 * WHY `flex-wrap` + `min-w-fit` rather than a fixed-column grid: this one
 * component draws every segmented row in the model, from 3 options (Align)
 * to 6 (Fill style) — a grid needs one column count that works for both ends
 * of that range, and any fixed count either leaves a ragged half-empty last
 * row on a small group or squeezes a wide one. Wrapping lets each row size to
 * its own option count and only spill onto a second line when the labels
 * genuinely do not fit the 280px dock, which is the clipping bug this
 * replaces (Fill style used to cut off at "fill|", `lined-fill` pushed
 * off-screen entirely).
 */
function SegmentGroup({ control, onChange }: { control: InspectorControl; onChange(value: InspectorValue): void }) {
	const current = typeof control.value === 'string' ? control.value : undefined
	return (
		<ToggleGroup
			value={current ? [current] : []}
			onValueChange={(next) => { if (next[0] !== undefined) onChange(next[0]) }}
			aria-label={control.label}
			className="w-full flex-wrap"
		>
			{(control.options ?? []).map((option) => (
				<ToggleGroupItem
					key={option.value}
					value={option.value}
					data-testid={`inspector-segment-${control.id}-${option.value}`}
					className="min-w-fit flex-1 text-xs"
				>
					{option.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	)
}

function ToggleRow({ control, onChange }: { control: InspectorControl; onChange(value: InspectorValue): void }) {
	return (
		<Switch
			checked={control.value === true}
			data-testid={`inspector-toggle-${control.id}`}
			aria-label={control.label}
			onCheckedChange={(checked) => onChange(checked)}
		/>
	)
}

/** Drafted, committed on blur/Enter — a keystroke-per-history entry buried the
 *  last real edit under a hundred undo steps when this committed live. */
function TextRow({ control, onChange }: { control: InspectorControl; onChange(value: InspectorValue): void }) {
	const current = control.value === null ? '' : String(control.value)
	const [draft, setDraft] = useState<string | null>(null)
	const commit = () => {
		if (draft !== null && draft !== current) onChange(draft)
		setDraft(null)
	}
	return (
		<Input
			value={draft ?? current}
			placeholder={control.unset ? 'default' : control.value === null ? 'Mixed' : ''}
			aria-label={control.label}
			data-testid={`inspector-text-${control.id}`}
			className="h-7"
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') commit()
				if (event.key === 'Escape') setDraft(null)
			}}
		/>
	)
}

/** A `Popover` + `react-colorful`'s `HexAlphaColorPicker`, plus an honest text
 *  field: the well only speaks 8-digit hex, but the engine paints
 *  `rgba(...)`/`color-mix(...)` too, so the text field stays the general path. */
function ColorRow({
	control,
	onChange,
	onClear,
}: {
	control: InspectorControl
	onChange(value: InspectorValue): void
	onClear(): void
}) {
	const current = typeof control.value === 'string' ? control.value : ''
	const [draft, setDraft] = useState<string | null>(null)
	const hex = /^#[0-9a-f]{6,8}$/i.test(current) ? current : '#00000000'
	const commitText = () => {
		if (draft === null) return
		const next = draft.trim()
		setDraft(null)
		// An emptied field CLEARS the override rather than storing "" — a reset
		// row must read as untouched, not as "explicitly set to nothing".
		if (next === '') { onClear(); return }
		if (!isColor(next)) return
		if (next !== current) onChange(next)
	}
	return (
		<div className="flex items-center gap-1.5">
			<Popover>
				<PopoverTrigger
					render={
						<button
							type="button"
							aria-label={`${control.label} picker`}
							data-testid={`inspector-color-${control.id}`}
							className="size-6 shrink-0 rounded-md border border-border"
							style={{ background: current || 'transparent' }}
						/>
					}
				/>
				<PopoverContent className="w-auto p-2">
					{/* react-colorful only parses hex/hex8 — `current` can be any CSS
					    colour the engine accepts (`rgba(...)`, `color-mix(...)`), so
					    the picker gets the coerced `hex` and the text field beside it
					    stays the general path for everything else. */}
					<HexAlphaColorPicker
						color={hex === '#00000000' ? '#000000ff' : hex}
						onChange={(next) => onChange(next)}
					/>
				</PopoverContent>
			</Popover>
			<Input
				spellCheck={false}
				value={draft ?? current}
				placeholder={control.unset ? 'default' : control.value === null ? 'Mixed' : 'default'}
				aria-label={`${control.label} value`}
				data-testid={`inspector-color-text-${control.id}`}
				className="h-7 flex-1"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commitText}
				onKeyDown={(event) => {
					if (event.key === 'Enter') commitText()
					if (event.key === 'Escape') setDraft(null)
				}}
			/>
		</div>
	)
}

/** One row's control, whichever kind it is. */
function Control({
	control,
	onChange,
	onClear,
}: {
	control: InspectorControl
	onChange(id: string, value: InspectorValue, gestureStart: boolean): void
	onClear(id: string): void
}) {
	const set = (value: InspectorValue, gestureStart = true) => onChange(control.id, value, gestureStart)
	switch (control.kind) {
		case 'number':
			return (
				<ScrubNumber
					value={typeof control.value === 'number' ? control.value : null}
					unset={control.unset}
					min={control.min}
					max={control.max}
					step={control.step}
					unit={control.unit}
					glyph={control.glyph}
					fallback={control.fallback}
					label={control.label}
					testId={control.id}
					title={control.hint ?? control.label}
					disabled={control.disabled}
					onChange={(value, gestureStart) => set(value, gestureStart)}
				/>
			)
		case 'tiles':
			return <TileGroup control={control} onChange={set} />
		case 'segments':
			return <SegmentGroup control={control} onChange={set} />
		case 'swatches':
			return <SwatchGrid control={control} onChange={set} />
		case 'text':
			return <TextRow control={control} onChange={set} />
		case 'toggle':
			return <ToggleRow control={control} onChange={set} />
		case 'color':
		default:
			return <ColorRow control={control} onChange={set} onClear={() => onClear(control.id)} />
	}
}

/** Consecutive controls sharing a `caption` sit under one small muted label;
 *  a run of `paired` controls (X/Y, W/H) packs into one 2-column grid instead
 *  of a full-width row each, which is what keeps a 280px column from
 *  truncating a label. */
function captionBlocks(controls: InspectorControl[]): Array<{ caption: string | null; controls: InspectorControl[] }> {
	const blocks: Array<{ caption: string | null; controls: InspectorControl[] }> = []
	for (const control of controls) {
		const caption = control.caption ?? null
		const last = blocks[blocks.length - 1]
		if (last && last.caption === caption && caption !== null) last.controls.push(control)
		else blocks.push({ caption, controls: [control] })
	}
	return blocks
}

function ControlRow({
	control,
	onChange,
	onClear,
}: {
	control: InspectorControl
	onChange(id: string, value: InspectorValue, gestureStart: boolean): void
	onClear(id: string): void
}) {
	return (
		<div className="flex items-center gap-1.5" data-control={control.id} data-source={control.source}>
			{control.paired ? null : (
				<span
					className="w-20 shrink-0 truncate text-xs text-muted-foreground"
					title={control.source === 'style' ? 'tldraw style — inherited by the next shape drawn' : control.source === 'paint' ? 'display override — the record stays stock tldraw' : 'stock shape property, saved in the file'}
				>
					{control.label}
				</span>
			)}
			<div className="min-w-0 flex-1">
				<Control control={control} onChange={onChange} onClear={onClear} />
			</div>
			{control.value === null && !control.unset
				&& control.kind !== 'number' && control.kind !== 'text' && control.kind !== 'color'
				? <span className="shrink-0 text-[10px] text-muted-foreground">Mixed</span>
				: null}
			{control.overridden ? (
				<button
					type="button"
					title={`Reset ${control.label} to tldraw's own value`}
					aria-label={`Reset ${control.label}`}
					data-testid={`inspector-clear-${control.id}`}
					className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
					onClick={() => onClear(control.id)}
				>
					×
				</button>
			) : null}
		</div>
	)
}

/**
 * The Figma/open-pencil section row: no filled background at rest, a sentence
 * -case label, a chevron that rotates open, `hover:bg-accent` only.
 *
 * WHY an explicit reset (`border-0 bg-transparent p-0 appearance-none`)
 * rather than relying on a global one: this lab's whole `app.css` premise
 * (see its own top-of-file WHY) is importing Tailwind WITHOUT preflight, so
 * `<button>` keeps the browser's own chrome — a light grey fill, an outset
 * border, UA padding — until an author rule overrides it. Every other button
 * on this panel either goes through shadcn's `Button`/`Toggle` (which already
 * carry that reset in their own base classes) or sets every property the UA
 * sheet would otherwise win; this is the one raw `<button>` case, so it
 * carries the reset explicitly. Without it this exact row read as a filled
 * grey bar with unreadable text in dark mode — a real bug, not a hypothetical
 * one — because `text-foreground` was correctly winning the *text* colour
 * while the untouched UA background stayed light in both themes.
 */
function GroupSection({
	group,
	isLast,
	onChange,
	onClear,
}: {
	group: InspectorGroup
	isLast: boolean
	onChange(id: string, value: InspectorValue, gestureStart: boolean): void
	onClear(id: string): void
}) {
	return (
		<Collapsible defaultOpen>
			<CollapsibleTrigger
				render={
					<button
						type="button"
						data-testid={`inspector-group-${group.id}`}
						className="group flex w-full appearance-none items-center justify-between gap-2 border-0 bg-transparent px-3 py-2 text-xs font-semibold text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
					/>
				}
			>
				<span>{group.label}</span>
				<ChevronRight
					aria-hidden="true"
					className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[panel-open]:rotate-90"
				/>
			</CollapsibleTrigger>
			<CollapsibleContent className="flex flex-col gap-2 px-3 pb-3">
				{captionBlocks(group.controls).map((block, index) => (
					<div key={`${block.caption ?? 'block'}-${index}`} className="flex flex-col gap-1">
						{block.caption ? (
							<p className="text-[10px] text-muted-foreground">{block.caption}</p>
						) : null}
						<div className={block.controls.every((control) => control.paired) ? 'grid grid-cols-2 gap-1.5' : 'flex flex-col gap-1.5'}>
							{block.controls.map((control) => (
								<ControlRow key={control.id} control={control} onChange={onChange} onClear={onClear} />
							))}
						</div>
					</div>
				))}
			</CollapsibleContent>
			{isLast ? null : <Separator />}
		</Collapsible>
	)
}

/** Pure presentation — exported so the surface stays assertable without an
 *  editor, the same split the donor's `PrimitiveInspectorView` drew. */
export function InspectorView({
	model,
	onChange,
	onClear,
	onReset,
	onUnlock,
}: {
	model: PrimitiveInspectorModel | null
	onChange(id: string, value: InspectorValue, gestureStart: boolean): void
	onClear(id: string): void
	onReset(): void
	onUnlock(): void
}) {
	return (
		<div data-testid="inspector-panel" className="flex h-full flex-col">
			<header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
				<div className="min-w-0">
					<h2 className="truncate text-sm font-semibold text-foreground">
						{model?.title ?? 'Inspector'}
					</h2>
					{model ? (
						<p className="truncate text-xs text-muted-foreground">{model.types.join(' · ')}</p>
					) : null}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					{model?.hasOverrides ? (
						<Button size="xs" variant="ghost" data-testid="inspector-reset" onClick={onReset}>
							Reset
						</Button>
					) : null}
					{model?.locked ? (
						<Button size="xs" variant="ghost" data-testid="inspector-unlock" onClick={onUnlock}>
							Unlock
						</Button>
					) : null}
				</div>
			</header>
			<ScrollArea className="min-h-0 flex-1">
				{model ? (
					<div className="flex flex-col">
						{model.groups.map((group, index) => (
							<GroupSection
								key={group.id}
								group={group}
								isLast={index === model.groups.length - 1}
								onChange={onChange}
								onClear={onClear}
							/>
						))}
					</div>
				) : (
					// WHY the dock never disappears on an empty selection: a mask that
					// diffs a fixed dock rect (tests/stock_pixels.mjs) needs a stable
					// rect to zero, and a panel that vanishes and reappears is also a
					// worse affordance than one that says what it's waiting for.
					<Field className="p-4">
						<FieldDescription>Select something to inspect it.</FieldDescription>
					</Field>
				)}
			</ScrollArea>
		</div>
	)
}

/** The reactive adapter. Nothing above this line reads the editor. */
function InspectorPanel({ editor }: { editor: Editor }) {
	// Keyed on the reading itself, exactly as the donor's `PrimitiveInspector`
	// does: the model recomputes on every frame a shape is dragged, and only a
	// changed reading should re-render the panel.
	const key = useValue(
		'tldraw styling lab inspector identity',
		() => primitiveInspectorKey(getPrimitiveInspectorModel(editor)),
		[editor],
	)
	const liveModel = useValue(
		'tldraw styling lab inspector',
		() => (key === null ? null : getPrimitiveInspectorModel(editor)),
		[editor, key],
	)

	// WHY a frozen snapshot rather than `liveModel` directly: a field commits
	// its typed value on BLUR, and clicking a different shape on canvas fires
	// tldraw's own pointerdown handler — which calls `editor.select(...)` and
	// so re-renders this component with the NEW selection's model — BEFORE the
	// browser's default action moves focus away from the field and dispatches
	// its `blur`. `useValue` subscribes through a plain `addEventListener`
	// outside React's synthetic event system, so that re-render is not batched
	// with the pointerdown and lands synchronously, ahead of the blur. Without
	// this, the row's `onChange`/`onClear` closures — freshly re-created on
	// that render — would already close over the NEW shape's `shapeIds`, and
	// the value the panel was showing when the user typed it would commit to
	// whatever got clicked instead. Freezing while focus is inside the dock,
	// and only adopting a new reading once nothing here is focused, is what
	// makes "the shapes the panel was showing" a fact a blur can rely on
	// rather than a race it usually wins. See docs/log.md's M2 entry.
	const frozen = useRef(liveModel)
	const sameSelection = frozen.current !== null && liveModel !== null
		&& frozen.current.shapeIds.length === liveModel.shapeIds.length
		&& frozen.current.shapeIds.every((id, index) => id === liveModel.shapeIds[index])
	const focusedInDock = typeof document !== 'undefined'
		&& document.activeElement?.closest('[data-testid="inspector"]') != null
	// eslint-disable-next-line react/refs -- the sanctioned "compare against a
	// ref during render and adjust it" pattern (React's own docs: "Storing
	// information from previous renders"), not an effect, because an effect
	// would run AFTER this render commits — one render too late to stop the
	// closures below from capturing the wrong (about-to-be-superseded) model.
	// Editing the SAME shapes always sees live updates (a value that just
	// committed, a row that just gained its overridden dot) — the freeze only
	// matters when the selection itself is about to change while something
	// here is still focused.
	if (sameSelection || !focusedInDock) frozen.current = liveModel
	const model = frozen.current

	return (
		<InspectorView
			model={model}
			onChange={(id, value, gestureStart) => {
				if (!model) return
				applyPrimitiveInspectorControl(editor, id, value, { mark: gestureStart, shapeIds: model.shapeIds })
			}}
			// The shapes this reading described — `ColorRow`/`TextRow` clear or
			// commit on blur, which is after the click that may have moved the
			// selection onto a different shape.
			onClear={(id) => clearPrimitiveInspectorControl(editor, id, model?.shapeIds)}
			onReset={() => resetPrimitiveOverrides(editor, model?.shapeIds)}
			onUnlock={() => unlockPrimitiveInspectorSelection(editor)}
		/>
	)
}

/**
 * The dock: an overlay INSIDE `.tl-container`, never a flex sibling.
 *
 * WHY absolute, not a layout sibling that shrinks the canvas: a sibling panel
 * changes the canvas's own viewport width, which shifts the camera and makes
 * `tests/stock_pixels.mjs` compare two different pictures instead of the same
 * one with a dock drawn over part of it. An overlay leaves the canvas exactly
 * where `bare.html` puts it; the pixel gate then only has to mask the dock's
 * own rect, not re-derive a moved viewport.
 */
export function Inspector({ isMobile: _isMobile, styles: _styles, children: _children }: TLUiStylePanelProps) {
	const editor = useEditor()
	const ref = useRef<HTMLDivElement>(null)
	usePassThroughWheelEvents(ref)

	useEffect(() => {
		const element = ref.current
		if (!element) return

		function handlePointerMove(event: PointerEvent) {
			// WHY markEventAsHandled and never stopPropagation: stopPropagation
			// on a panel wrapper breaks a slider/scrub's own pointer capture
			// (this repo's `ScrubNumber` included) the same way it does in stock
			// tldraw's own `DefaultStylePanel` — see the file comment there.
			editor.markEventAsHandled(event)
		}
		function handleKeyDown(event: KeyboardEvent) {
			// WHY re-read `ref.current` instead of closing over the `element`
			// this effect captured: a `const` narrowed by an early-return guard
			// still reads as possibly-null once referenced from a nested handler
			// under this project's `tsc -b` strictness, and re-reading through
			// the ref with optional chaining is simpler than a non-null assertion.
			if (event.key === 'Escape' && ref.current?.contains(document.activeElement)) {
				event.stopPropagation()
				editor.getContainer().focus()
			}
		}
		element.addEventListener('pointermove', handlePointerMove)
		element.addEventListener('keydown', handleKeyDown, { capture: true })
		return () => {
			element.removeEventListener('pointermove', handlePointerMove)
			element.removeEventListener('keydown', handleKeyDown, { capture: true })
		}
	}, [editor])

	return (
		<div
			ref={ref}
			data-testid="inspector"
			// WHY `font-sans` here at all: this lab's `app.css` deliberately drops
			// shadcn's own `@layer base { html { @apply font-sans } }` block (see
			// its top-of-file WHY) to protect the pixel gate from a global reset —
			// which also means NOTHING sets a sans-serif font anywhere by default,
			// dock included. Without this the whole panel silently rendered in the
			// browser's serif fallback (`Times New Roman`), not just a missed
			// detail on one popover. `font-sans` here fixes every element that is
			// an actual DOM descendant of the dock; it does NOT reach a shadcn
			// `Popover`'s content, which Base UI portals to a sibling of `#root`
			// under `<body>` — see the matching `[data-slot="popover-content"]`
			// rule in app.css for that one.
			className="pointer-events-auto absolute top-0 right-0 bottom-0 w-[280px] border-l border-border bg-background font-sans text-foreground"
		>
			{/* M3: the Inspect dock over one shape's paint (layer 1+2, above) and
			    the Theme tab over the app-global palette (layer 3, `ThemePanel.tsx`)
			    are two different questions — "what can THIS shape be" vs. "what
			    does the app's whole palette resolve to" — so they get two tabs
			    rather than one more group in the same list. `TabsContent` for the
			    inactive tab unmounts by default (Base UI's own behaviour), which is
			    what keeps `InspectorPanel`'s selection-tracking effects from
			    running while the Theme tab is the one on screen. */}
			{/* WHY `mt-9`: stock tldraw's own `.tlui-share-zone` (the M4
			    `StockCheckButton`, mounted via `components.SharePanel` in
			    App.tsx) is normal-flow, top-right, ~32px tall — stock's own
			    `.tlui-style-panel__wrapper` never collides with it because BOTH
			    are flex siblings stacked top-to-bottom in tldraw's own layout.
			    This dock breaks that by being `position: absolute` (M2's own
			    WHY, load-bearing for the pixel gate's camera-stability
			    invariant — not something to undo here), which takes it out of
			    that flow entirely, so the tab bar drawn at this dock's own
			    top:0 physically overlapped the Stock Check button's hit area
			    once M4 landed — `elementFromPoint` at the Theme tab's own
			    center returned the button, not the tab, so no click ever
			    reached it. Clearing a fixed 36px (measured stock zone height
			    ~32px + a few px, the same shape of buffer stock's own 4-8px
			    margin uses) is simpler and more robust than reading the
			    zone's live height, and costs nothing: the OUTER `data-testid=
			    "inspector"` rect (what the pixel gate masks, and what
			    `bottom-0`/`ScrollArea` size against) is unchanged — only the
			    Tabs content inside it starts lower. */}
			<Tabs defaultValue="inspect" className="mt-9 h-[calc(100%-2.25rem)] gap-0">
				<TabsList variant="line" className="w-full shrink-0 rounded-none border-b border-border px-1 pt-1">
					<TabsTrigger value="inspect" data-testid="inspector-tab-inspect">Inspect</TabsTrigger>
					<TabsTrigger value="theme" data-testid="inspector-tab-theme">Theme</TabsTrigger>
				</TabsList>
				<TabsContent value="inspect" className="min-h-0 flex-1">
					<InspectorPanel editor={editor} />
				</TabsContent>
				<TabsContent value="theme" className="min-h-0 flex-1">
					<ThemePanel editor={editor} />
				</TabsContent>
			</Tabs>
		</div>
	)
}
