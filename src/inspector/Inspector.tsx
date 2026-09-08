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
import { FigmaAnatomyView } from './variants/figmaVariants'
import {
	CompactSelect,
	IconButton,
	ListRow,
	fieldGroupLabelClass,
	iconTileClass,
	ResizeHandle,
	SegmentedControl,
	VariantPicker,
	hexAlphaPercent,
	useDockWidth,
	withHexAlphaPercent,
	type SegmentedItem,
} from './variants/kit'
import { getVariant, INLINE_PREFIXES, isFigmaAnatomyVariant, VARIANTS } from './variants/theme'
import { TLDRAW_ICONS, TldrawIcon } from './variants/tldrawIcons'

/** Read once at startup, same rule as `readSeedMode`/`getVariant` itself —
 *  see `variants/theme.ts`'s own WHY. */
const VARIANT = getVariant()
const V = VARIANTS[VARIANT]

/** An option gets an icon when the variant asks for icons on this control id
 *  AND `tldrawIcons.tsx` actually ships one for this value — `geo` never
 *  does (the app's own rounded rect has no tldraw asset), so it always
 *  falls through to the hand-drawn `Glyph` below regardless of variant. */
function enumIcon(controlId: string, value: string): string | undefined {
	const wants = V.iconControlIds === 'all' || V.iconControlIds.has(controlId)
	return wants ? TLDRAW_ICONS[controlId]?.[value] : undefined
}

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

/**
 * WHY plain buttons + `iconTileClass`, not shadcn's `ToggleGroup`/`Toggle`
 * (what this drew before round 2 of the audit): neither `toggleVariants`'
 * "default" variant nor a bare `border-transparent` resets the browser's
 * OWN default button chrome — this app deliberately ships no Tailwind
 * preflight (app.css's own WHY), so every tile rendered as a visibly
 * bordered/outset box regardless of the colour classes applied. `iconTileClass`
 * (kit.tsx) carries the explicit `appearance-none border-0` reset open-
 * pencil's own icon button never needed because its host DOES run preflight.
 */
function TileGroup({ control, onChange }: { control: InspectorControl; onChange(value: InspectorValue): void }) {
	const current = typeof control.value === 'string' ? control.value : undefined
	return (
		<TooltipProvider>
			<div className="flex flex-wrap gap-1" role="radiogroup" aria-label={control.label}>
				{(control.options ?? []).map((option) => (
					<Tooltip key={option.value}>
						<TooltipTrigger
							render={
								<button
									type="button"
									role="radio"
									aria-checked={option.value === current}
									aria-label={option.label}
									data-testid={`inspector-tile-${control.id}-${option.value}`}
									data-state={option.value === current ? 'on' : 'off'}
									className={iconTileClass}
									onClick={() => onChange(option.value)}
								/>
							}
						>
							{enumIcon(control.id, option.value)
								? <TldrawIcon id={control.id} value={option.value} className="size-4 shrink-0" />
								: <Glyph name={option.value} path={option.path} viewBox={option.viewBox} />}
						</TooltipTrigger>
						<TooltipContent>{option.label}</TooltipContent>
					</Tooltip>
				))}
			</div>
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
	const options = control.options ?? []
	const items: SegmentedItem[] = options.map((option) => {
		const icon = enumIcon(control.id, option.value)
		return {
			value: option.value,
			label: option.label,
			// WHY `size-4` exactly: the stock style panel draws its own icons at
			// 18px inside a 40px button (a ~0.45 ratio); this segment item is
			// 22px tall, so 16px (size-4) lands on the same ratio without
			// spilling past the item's own edge — round-2 audit measured the
			// previous `size-3.5` wrapper as clipped/oversized because the
			// injected raw SVG carried its OWN `width="30" height="30"`
			// attributes that a wrapper class alone cannot override (fixed at
			// the source in tldrawIcons.tsx's `recolored`, not here).
			icon: icon ? <TldrawIcon id={control.id} value={option.value} className="size-4 shrink-0" /> : undefined,
		}
	})
	// V3 "Inline"'s own rule: an enum wider than the variant's threshold
	// (font/fill-style/dash all clear V1/V2's shared Infinity) collapses to
	// a Select instead of wrapping onto a second row — see theme.ts's WHY.
	if (options.length > V.selectThreshold) {
		return (
			<CompactSelect
				items={items}
				value={current}
				onChange={onChange}
				testId={`inspector-segment-${control.id}`}
				ariaLabel={control.label}
			/>
		)
	}
	return (
		<SegmentedControl
			items={items}
			value={current}
			onChange={onChange}
			testIdPrefix={`inspector-segment-${control.id}`}
			ariaLabel={control.label}
		/>
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

/**
 * open-pencil's own colour row (Zach's screenshot: swatch · hex text · alpha
 * % · clear ×) rather than the wider swatch-plus-popover well this replaces.
 * A `Popover` + `react-colorful`'s `HexAlphaColorPicker` still opens off the
 * swatch — the well only speaks 8-digit hex, but the engine paints
 * `rgba(...)`/`color-mix(...)` too, so the text field stays the general path.
 *
 * WHY the alpha % field is DERIVED from the same hex8 string rather than a
 * second piece of state: `inspectorModel.ts` keeps one colour value per row,
 * never a separate channel — reading/writing the last hex byte as 0-100 is
 * pure view-layer arithmetic (`kit.tsx`'s `hexAlphaPercent`/
 * `withHexAlphaPercent`), not a model change, which this pass is scoped to
 * avoid (see docs/log.md).
 */
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
		<ListRow
			testId={control.id}
			swatch={
				<Popover>
					<PopoverTrigger
						render={
							<button
								type="button"
								aria-label={`${control.label} picker`}
								data-testid={`inspector-color-${control.id}`}
								className="size-5 shrink-0 rounded-sm border border-[var(--v-border)]"
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
			}
			name={
				<input
					spellCheck={false}
					value={draft ?? current}
					placeholder={control.unset ? 'default' : control.value === null ? 'Mixed' : 'default'}
					aria-label={`${control.label} value`}
					data-testid={`inspector-color-text-${control.id}`}
					className="w-full min-w-0 border-0 bg-transparent p-0 text-[11px] text-[var(--v-surface)] outline-none"
					onChange={(event) => setDraft(event.target.value)}
					onBlur={commitText}
					onKeyDown={(event) => {
						if (event.key === 'Enter') commitText()
						if (event.key === 'Escape') setDraft(null)
					}}
				/>
			}
		>
			<div className="w-14 shrink-0">
				<ScrubNumber
					value={current ? hexAlphaPercent(current) : null}
					unset={!current}
					min={0}
					max={100}
					step={1}
					unit="%"
					// WHY 100, not left as ScrubNumber's own `min`-based default:
					// an unset row falls back to `fallback ?? min ?? 0` — with no
					// `fallback` this read "0 %" for an override that was never
					// set at all, which paints as fully transparent even though
					// the engine is actually painting a solid, opaque fill.
					// 100 is what every unset colour row already assumes (no
					// override reaches this except a genuine 0% commit), matching
					// the same "show tldraw's own number, greyed" convention every
					// other unset numeric row already follows.
					fallback={100}
					label={`${control.label} alpha`}
					testId={`color-alpha-${control.id}`}
					title="Alpha, read from this colour's own hex8 — the model still keeps one colour value, not a separate channel."
					onChange={(percent) => onChange(withHexAlphaPercent(current || '#000000', percent))}
				/>
			</div>
		</ListRow>
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
					prefixText={V.inlinePrefixes ? INLINE_PREFIXES[control.id] : undefined}
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
	// V3 "Inline": a field whose letter/symbol prefix is already printed
	// INSIDE it (X/Y/W/H/°/%, see `variants/theme.ts`'s `INLINE_PREFIXES`)
	// drops the caption a Verbatim/Canvas-native row still needs — the
	// prefix carries the same information the label did, at a fraction of
	// the width, which is the whole point of a denser layout.
	const hasInlinePrefix = V.inlinePrefixes && control.kind === 'number' && INLINE_PREFIXES[control.id] !== undefined
	const labelTitle = control.source === 'style' ? 'tldraw style — inherited by the next shape drawn' : control.source === 'paint' ? 'display override — the record stays stock tldraw' : 'stock shape property, saved in the file'
	const mixed = control.value === null && !control.unset
		&& control.kind !== 'number' && control.kind !== 'text' && control.kind !== 'color'
	const resetButton = control.overridden ? (
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
	) : null
	// WHY the label moves ABOVE the control for segments/tiles rather than
	// staying in the shared `w-20` side column every other kind uses: a
	// fixed 80px label column left as little as ~130px for a 6-item row at
	// the 240px floor — barely enough for the ROW'S OWN 12px/item padding,
	// let alone real content, which is what round 2's "no segment item may
	// truncate" check caught (measured: even ICON-only fill items were 5px
	// short of fitting). A caption row above, open-pencil's own convention
	// for a field whose control needs its full width, gives every segmented/
	// tile row the whole ~190px content width instead of the ~130px a
	// beside-label layout could ever offer it.
	if (control.kind === 'segments' || control.kind === 'tiles') {
		return (
			<div className="flex flex-col gap-1" data-control={control.id} data-source={control.source}>
				<div className="flex items-center gap-1.5">
					<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={labelTitle}>
						{control.label}
					</span>
					{mixed ? <span className="shrink-0 text-[10px] text-muted-foreground">Mixed</span> : null}
					{resetButton}
				</div>
				<Control control={control} onChange={onChange} onClear={onClear} />
			</div>
		)
	}
	return (
		<div className="flex min-h-6 items-center gap-1.5" data-control={control.id} data-source={control.source}>
			{control.paired || hasInlinePrefix ? null : (
				<span className="w-20 shrink-0 truncate text-xs text-muted-foreground" title={labelTitle}>
					{control.label}
				</span>
			)}
			<div className="min-w-0 flex-1">
				<Control control={control} onChange={onChange} onClear={onClear} />
			</div>
			{mixed ? <span className="shrink-0 text-[10px] text-muted-foreground">Mixed</span> : null}
			{resetButton}
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
		// Every variant's own screenshot shows this affordance (Zach's
		// reference: the ↺ in a section's actions column, present only once
		// something in that section has actually drifted from tldraw's own
		// value) — a per-GROUP reset, distinct from the dock header's
		// existing all-shapes Reset: it clears exactly the rows this one
		// section shows overridden, via the same `onClear` every row's own
		// × already calls.
	const overriddenIds = group.controls.filter((control) => control.overridden).map((control) => control.id)
	return (
		<Collapsible defaultOpen>
			{/* WHY the reset icon is a SIBLING of the trigger, not a child of it:
			    `CollapsibleTrigger` renders as a real `<button>` (below) — nesting
			    another interactive `<button>` inside it is invalid HTML the
			    browser silently reflows, which is exactly the kind of "looks
			    fine, breaks on click" bug a nested button always is. The outer
			    grid carries the shared `hover:bg-accent` so the whole row still
			    reads as one hoverable strip even though only part of it is the
			    actual toggle. */}
			<div className="grid w-full grid-cols-[1fr_auto] items-center gap-2 hover:bg-accent">
				<CollapsibleTrigger
					render={
						<button
							type="button"
							data-testid={`inspector-group-${group.id}`}
							// WHY `group` stays on THIS button, not the outer row div: Base UI
							// stamps `data-panel-open` on the trigger itself, and Tailwind's
							// `group-data-[panel-open]` selector needs the `.group` marker on
							// the SAME element that carries the data attribute — moving it to
							// an ancestor that never gets that attribute silently stops the
							// chevron from ever rotating.
							//
							// WHY `justify-between` here (round 2 of the audit) rather than
							// moving the chevron out of the trigger entirely: open-pencil's
							// own header keeps the disclosure chevron at the RIGHT edge next
							// to the actions column, not immediately after the title — but
							// the chevron still has to stay a DOM descendant of this `group`-
							// tagged button for its own rotation to work at all, so it moves
							// to this button's own right edge (via `justify-between`) rather
							// than a genuinely separate element in the sibling actions column.
							className="group flex w-full appearance-none items-center justify-between border-0 bg-transparent px-3 py-2 text-left text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
						/>
					}
				>
					<span>{group.label}</span>
					<ChevronRight
						aria-hidden="true"
						className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[panel-open]:rotate-90"
					/>
				</CollapsibleTrigger>
				{overriddenIds.length > 0 ? (
					<IconButton
						title={`Reset ${group.label} to tldraw's own values`}
						data-testid={`inspector-group-reset-${group.id}`}
						className="mr-2 size-5"
						onClick={() => overriddenIds.forEach((id) => onClear(id))}
					>
						↺
					</IconButton>
				) : <span className="mr-2" />}
			</div>
			{/* Zach's own audit, item 6, measured verbatim from open-pencil's
			    PositionSection.vue/AppearanceSection.vue: caption→field is 4px
			    (the caption's own `mb-1`, not a flex `gap` — a flex `gap` and a
			    child's own margin-bottom STACK, they don't collapse, which is
			    exactly what made this row rhythm ~64px instead of open-pencil's
			    ~45 before this fix: a bare `<p>` with no reset carries the
			    browser's OWN default block margin (`margin-block: 1em` at THIS
			    element's own font-size), and this app runs no Tailwind preflight
			    to zero it — the same class of bug the rest of this file already
			    documents for `<button>`. `gap-0` here + `fieldGroupLabelClass`'s
			    own explicit `mb-1` is what makes 4px the WHOLE gap rather than
			    4px plus however tall an unreset `<p>`'s margin happens to be.
			    Consecutive groups (PanelGrids) are `gap-1.5` (6px), open-pencil's
			    own `mt-1.5`. */}
			<CollapsibleContent className="flex flex-col gap-1.5 px-3 pb-3">
				{captionBlocks(group.controls).map((block, index) => (
					<div key={`${block.caption ?? 'block'}-${index}`} className="flex flex-col gap-0">
						{block.caption ? (
							<p className={fieldGroupLabelClass}>{block.caption}</p>
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

	const onChange = (id: string, value: InspectorValue, gestureStart: boolean) => {
		if (!model) return
		applyPrimitiveInspectorControl(editor, id, value, { mark: gestureStart, shapeIds: model.shapeIds })
	}
	// The shapes this reading described — `ColorRow`/`TextRow` clear or
	// commit on blur, which is after the click that may have moved the
	// selection onto a different shape.
	const onClear = (id: string) => clearPrimitiveInspectorControl(editor, id, model?.shapeIds)
	const onReset = () => resetPrimitiveOverrides(editor, model?.shapeIds)
	const onUnlock = () => unlockPrimitiveInspectorSelection(editor)

	// Round 2: 4/5/6 draw the Figma anatomy through a completely different
	// component tree (`figmaVariants.tsx`) rather than round 1's group-based
	// `InspectorView` — see `variants/theme.ts`'s `isFigmaAnatomyVariant`.
	if (isFigmaAnatomyVariant(VARIANT)) {
		return (
			<FigmaAnatomyView
				variant={VARIANT}
				model={model}
				editor={editor}
				onChange={onChange}
				onClear={onClear}
				onReset={onReset}
				onUnlock={onUnlock}
			/>
		)
	}

	return <InspectorView model={model} onChange={onChange} onClear={onClear} onReset={onReset} onUnlock={onUnlock} />
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
	// Mandatory behaviour #1 (the variants brief): drag-to-resize, clamped,
	// persisted (skipped on a `?seed=` run — see `useDockWidth`'s own WHY),
	// reset on double-click. `ResizeHandle` computes the delta; this is just
	// where the number lives.
	const [dockWidth, setDockWidth] = useDockWidth()

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
			// `data-variant` is what every `[data-variant]` rule in app.css keys
			// off (see that file's own WHY) — set once, here, so BOTH tabs
			// re-theme through one attribute instead of two.
			data-variant={VARIANT}
			style={{ width: dockWidth }}
			className="pointer-events-auto absolute top-0 right-0 bottom-0 border-l border-border bg-background font-sans text-foreground"
		>
			<ResizeHandle width={dockWidth} onWidth={setDockWidth} />
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
				<TabsList variant="line" className="w-full shrink-0 items-center justify-between rounded-none border-b border-border px-1 pt-1">
					<div className="flex">
						<TabsTrigger value="inspect" data-testid="inspector-tab-inspect">Inspect</TabsTrigger>
						<TabsTrigger value="theme" data-testid="inspector-tab-theme">Theme</TabsTrigger>
					</div>
					{/* Live variant flip on port 5180 — the review this is FOR. See
					    kit.tsx's `VariantPicker` for why it reloads rather than
					    re-theming in place. */}
					<VariantPicker current={VARIANT} />
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
