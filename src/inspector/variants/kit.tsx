/**
 * The shared skeleton every variant draws through — the brief's own words:
 * "a THEME + a few layout decisions, not three forks of Inspector.tsx".
 * Nothing here reads `inspectorModel.ts` or the editor; these are pure
 * presentational parts, same split `InspectorView`/`InspectorPanel` already
 * draws in `Inspector.tsx`.
 *
 * The palette itself lives in `src/styles/app.css`'s `[data-variant]` blocks
 * (see that file's own WHY) — every class string below reaches it through
 * `var(--v-*)`, never a literal hex, so re-theming stays a CSS-only edit.
 */
import { cloneElement, useEffect, useId, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'

import {
	DOCK_WIDTH_DEFAULT,
	DOCK_WIDTH_MAX,
	DOCK_WIDTH_MIN,
	readStoredDockWidth,
	variantUrl,
	writeStoredDockWidth,
	VARIANTS,
	type VariantId,
} from './theme'

/* --------------------------------------------------------------- tokens --
 * Open-pencil's own measured class strings (field.ts / segmented-control.ts /
 * section.ts / panel/header.ts / item-row.ts / splitter.ts), Tailwind's
 * bracket syntax swapped in for its shadcn/oklch tokens so every colour
 * resolves against THIS app's `--v-*` variant palette instead. Structure,
 * sizing and states are copied verbatim; only the colour source changed. */
export const panelFieldBase =
	'h-6 min-w-0 appearance-none rounded border-0 border border-transparent bg-[var(--v-field)] text-[var(--v-surface)] outline-none ' +
	'hover:bg-[var(--v-field-hover)] focus-within:border-[var(--v-focus)] focus-within:bg-[var(--v-field-hover)] ' +
	'disabled:opacity-50'
// WHY `appearance-none border-0` ON TOP OF `border border-transparent`: this
// app deliberately imports Tailwind WITHOUT preflight (app.css's own
// top-of-file WHY), so a raw `<button>` keeps the browser's OWN default
// border/background/padding until an author rule wins every property the UA
// sheet sets — `border-transparent` alone only zeroes the COLOUR, not the
// browser's own outset border-style, which is exactly what read as a visible
// bordered box around every icon tile/segment (Zach's audit, round 2).
// `appearance-none` strips the native button chrome; the explicit `border
// border-transparent` that follows is what open-pencil's own `panelIconButtonBase`
// specifies, now actually the ONLY border in play.
export const panelIconButtonBase =
	'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded border-0 appearance-none bg-transparent ' +
	'border border-transparent text-[var(--v-muted)] outline-none hover:bg-[var(--v-hover)] hover:text-[var(--v-surface)] ' +
	'focus-visible:border-[var(--v-focus)]'
/**
 * The geometry/arrowhead tile grid's own button — borderless, like
 * `panelIconButtonBase`, but ink stays the dock's own surface colour
 * REGARDLESS of pressed state (every tile is a distinct symbol a person
 * needs to read to pick the right one, unlike a segmented item's text where
 * muted-until-selected carries real meaning) — only the BACKGROUND changes
 * on selection, `data-[state=on]:bg-[var(--v-hover)]`, exactly what
 * `TileGroup`'s own pre-audit `text-foreground` (always-on ink) already
 * asserted; `tests/inspector_smoke.mjs`'s existing ink check depends on this.
 */
export const iconTileClass =
	'flex size-6 shrink-0 appearance-none cursor-pointer items-center justify-center rounded border-0 border border-transparent bg-transparent ' +
	'text-[var(--v-surface)] outline-none hover:bg-[var(--v-hover)] focus-visible:border-[var(--v-focus)] ' +
	'data-[state=on]:bg-[var(--v-hover)]'
export const segmentRootClass = 'inline-flex items-center gap-0.5 rounded bg-[var(--v-field)] p-0.5 hover:bg-[var(--v-field-hover)]'
// WHY `whitespace-nowrap overflow-hidden text-ellipsis`: a row like Fill
// style (6 options — none/semi/solid/pattern/fill/lined-fill) or Line style
// (5) has no spare width per item at a 280px dock. Without this, a long
// label ("lined fill") wraps onto a second line the item's own `h-[22px]`
// then clips vertically — measured in the gallery capture: it rendered as
// "ined fill", the wrapped first line's descenders sliced off by the fixed
// height. Truncating with an ellipsis is what open-pencil's own
// `min-w-0` (segmented-control.ts) implies but this port had not yet made
// explicit — a single line that shortens honestly instead of a silent
// two-line garble.
// `appearance-none border-0`: same reset as `panelIconButtonBase` above —
// this is a raw `<button>` with no border of its own at all (open-pencil's
// segmented item sits directly in the track, borderless; only the TRACK
// draws a surface, via `segmentRootClass`'s `bg-[var(--v-field)]`).
export const segmentItemClass =
	'flex h-[22px] min-w-0 flex-1 appearance-none cursor-pointer items-center justify-center gap-1 overflow-hidden rounded-sm border-0 px-1.5 text-[11px] whitespace-nowrap ' +
	'text-ellipsis text-[var(--v-muted)] outline-none hover:bg-[var(--v-hover)] hover:text-[var(--v-surface)] ' +
	'focus-visible:ring-1 focus-visible:ring-[var(--v-focus)] ' +
	'data-[state=on]:bg-[var(--v-hover)] data-[state=on]:text-[var(--v-surface)]'
export const sectionRootClass = 'border-b border-[var(--v-border)] px-3 pb-3'
export const sectionHeaderClass = 'grid h-8 min-w-0 items-center gap-1.5'
export const sectionTitleClass = 'text-[11px] font-semibold text-[var(--v-surface)]'
// WHY `mt-0` alongside `mb-1`: this class is used on a `<p>` in Inspector.tsx/
// ThemePanel.tsx (captionBlocks' own caption) — `mb-1` only sets the BOTTOM
// margin utility; a `<p>`'s UA default `margin-block-start` (~1em, computed
// against ITS OWN font-size) is untouched by that alone, since this app runs
// no Tailwind preflight to zero it globally. Left unset, it added an ~11px
// gap ABOVE every caption that the round-2 audit's own math didn't predict —
// found by measuring, not by reading the class list.
export const fieldGroupLabelClass = 'mt-0 mb-1 block truncate text-[11px] leading-none text-[var(--v-muted)]'
export const listRowClass = 'grid min-h-6 grid-cols-[1fr_auto] items-center gap-1.5 py-0.5'

/* ------------------------------------------------------------ icon button */

export function IconButton({
	className,
	title,
	...props
}: React.ComponentProps<'button'>) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			className={cn(panelIconButtonBase, className)}
			{...props}
		/>
	)
}

/* -------------------------------------------------------- section header --
 * The chevron + title + optional actions row `Inspector.tsx`'s `GroupSection`
 * and `ThemePanel.tsx`'s `NamedColorSection` both drew by hand, converged
 * into one component so the two files can't drift in how they theme it. */
export function SectionHeaderRow({
	title,
	testId,
	actions,
	leading,
}: {
	title: string
	testId?: string
	actions?: React.ReactNode
	leading?: React.ReactNode
}) {
	return (
		<CollapsibleTrigger
			render={
				<button
					type="button"
					data-testid={testId}
					className={cn(
						sectionHeaderClass,
						'group w-full appearance-none border-0 bg-transparent px-3 py-2 text-left outline-none hover:bg-[var(--v-hover)]',
						actions ? 'grid-cols-[14px_1fr_26px]' : 'grid-cols-[14px_1fr]',
					)}
				/>
			}
		>
			<ChevronRight
				aria-hidden="true"
				className="size-3.5 shrink-0 text-[var(--v-muted)] transition-transform duration-150 group-data-[panel-open]:rotate-90"
			/>
			<span className={cn(sectionTitleClass, 'flex min-w-0 items-center gap-2 truncate')}>
				{leading}
				<span className="truncate">{title}</span>
			</span>
			{actions ? <span className="flex justify-end" onClick={(event) => event.stopPropagation()}>{actions}</span> : null}
		</CollapsibleTrigger>
	)
}

export function Section({
	testId,
	title,
	headerTestId,
	actions,
	leading,
	isLast,
	defaultOpen = true,
	children,
}: {
	testId?: string
	title: string
	headerTestId?: string
	actions?: React.ReactNode
	leading?: React.ReactNode
	isLast?: boolean
	defaultOpen?: boolean
	children: React.ReactNode
}) {
	return (
		<Collapsible defaultOpen={defaultOpen} data-testid={testId} className={cn(!isLast && sectionRootClass)}>
			<SectionHeaderRow title={title} testId={headerTestId} actions={actions} leading={leading} />
			<CollapsibleContent className="flex flex-col gap-2 px-3 pb-1">{children}</CollapsibleContent>
		</Collapsible>
	)
}

/* -------------------------------------------------------------- grid/group */

export function FieldGroup({ label, children }: { label?: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			{label ? <span className={fieldGroupLabelClass}>{label}</span> : null}
			{children}
		</div>
	)
}

export function FieldGrid({ columns = 2, children }: { columns?: 2 | 3; children: React.ReactNode }) {
	return <div className={cn('grid items-end gap-1.5', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>{children}</div>
}

/* --------------------------------------------------------- segmented row --
 * open-pencil's segmented-control.ts, size `sm`. `items` carries either a
 * text label or a rendered icon node — never both — matching V1's own split
 * (text for fill/dash/size/font, icons for align/valign) and V2's "icon for
 * everything tldraw itself draws one for".
 */
export interface SegmentedItem {
	value: string
	label: string
	icon?: React.ReactNode
}

export function SegmentedControl({
	items,
	value,
	onChange,
	testIdPrefix,
	ariaLabel,
}: {
	items: SegmentedItem[]
	value: string | undefined
	onChange(value: string): void
	testIdPrefix: string
	ariaLabel: string
}) {
	// WHY no `flex-wrap` here (unlike the pre-kit.tsx ToggleGroup this
	// replaces): with the truncation fix above, a wide row (Fill style, Line
	// style) shrinks its own labels instead of spilling onto a second line —
	// one row, same height as every other segmented control, matching
	// open-pencil's own single-row convention.
	//
	// WHY an icon item gets a real `<Tooltip>`, not just its `title=`
	// attribute: an icon-only segment (Fill/Line style in V1, everything in
	// V2 — round 2 of the audit: "a text segment never truncates") has no
	// visible label at all, and a bare OS tooltip is slower and reads
	// inconsistently with every other tooltip this dock already draws
	// (TileGroup's geometry/arrowhead grid).
	return (
		<TooltipProvider>
			<div role="radiogroup" aria-label={ariaLabel} className={cn(segmentRootClass, 'w-full')}>
				{items.map((item) => {
					const button = (
						<button
							type="button"
							role="radio"
							aria-checked={item.value === value}
							aria-label={item.label}
							data-state={item.value === value ? 'on' : 'off'}
							data-testid={`${testIdPrefix}-${item.value}`}
							className={segmentItemClass}
							onClick={() => onChange(item.value)}
						>
							{item.icon ?? item.label}
						</button>
					)
					if (!item.icon) return cloneElement(button, { key: item.value })
					return (
						<Tooltip key={item.value}>
							<TooltipTrigger render={button} />
							<TooltipContent>{item.label}</TooltipContent>
						</Tooltip>
					)
				})}
			</div>
		</TooltipProvider>
	)
}

/** V3 "Inline": an enum past `selectThreshold` options becomes a compact
 *  Select styled to `panelFieldBase` instead of a segmented row — the
 *  brief's own example is font/fill-style/dash, all wider than four. */
export function CompactSelect({
	items,
	value,
	onChange,
	testId,
	ariaLabel,
	disabled,
}: {
	items: SegmentedItem[]
	value: string | undefined
	onChange(value: string): void
	testId: string
	ariaLabel: string
	/** Round 2's own WeightWordSelect: a control drawn (never dropped) for a
	 *  shape that offers no matching row — see that component's own WHY. */
	disabled?: boolean
}) {
	return (
		<Select value={value} onValueChange={(next) => { if (next !== null) onChange(next) }} disabled={disabled}>
			<SelectTrigger
				data-testid={testId}
				aria-label={ariaLabel}
				className={cn(panelFieldBase, 'w-full justify-between px-1.5 text-[11px] data-[size=default]:h-6')}
			>
				<SelectValue placeholder="—" />
			</SelectTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.value} value={item.value} data-testid={`${testId}-${item.value}`}>
						<span className="flex items-center gap-1.5">{item.icon}{item.label}</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

/* ------------------------------------------------------------- list row --
 * open-pencil's item-row.ts: swatch, name/hex, a small alpha% field, clear.
 * The alpha % is DERIVED from the control's own hex8 string (its last byte)
 * — inspectorModel.ts keeps one colour value, not a separate alpha channel,
 * so splitting/recombining it is pure view-layer arithmetic, never a model
 * change (out of scope for this pass — see docs/log.md).
 */
function hexAlphaPercent(hex: string): number {
	const match = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.exec(hex)
	if (!match) return 100
	if (!match[1]) return 100
	return Math.round((Number.parseInt(match[1], 16) / 255) * 100)
}
function withHexAlphaPercent(hex: string, percent: number): string {
	const base = /^#[0-9a-f]{6}/i.exec(hex)?.[0] ?? '#000000'
	const byte = Math.max(0, Math.min(255, Math.round((percent / 100) * 255)))
	return `${base}${byte.toString(16).padStart(2, '0')}`
}
export { hexAlphaPercent, withHexAlphaPercent }

export function ListRow({
	testId,
	swatch,
	name,
	onClear,
	children,
}: {
	testId: string
	swatch: React.ReactNode
	name: React.ReactNode
	onClear?: () => void
	children?: React.ReactNode
}) {
	return (
		<div className={listRowClass} data-testid={`inspector-listrow-${testId}`}>
			<div className="flex min-w-0 items-center gap-1.5">
				{swatch}
				<span className="min-w-0 flex-1 truncate text-[11px] text-[var(--v-surface)]">{name}</span>
				{children}
			</div>
			{onClear ? (
				<IconButton
					title="Clear"
					data-testid={`inspector-listrow-clear-${testId}`}
					className="size-5"
					onClick={onClear}
				>
					×
				</IconButton>
			) : <span />}
		</div>
	)
}

/* ------------------------------------------------------------ resize --- */

/**
 * The 8px drag handle on the dock's left edge — open-pencil's splitter.ts
 * (`-mx-1 w-2 cursor-col-resize`, a 1px divider that turns accent on hover/
 * drag; the accent rule itself lives in app.css since it targets this
 * component's own `data-testid`, not a class this file would otherwise own).
 *
 * WHY pointer capture on the handle, not a window-level listener torn down
 * on unmount: a resize that outlives the component (a variant switch mid-
 * drag reloads the page) is not a case this app needs to survive, and
 * capture is what keeps the drag tracking correctly once the pointer leaves
 * the 8px hit target — exactly the reason `ScrubNumber.tsx`'s own scrub
 * does the same.
 */
export function ResizeHandle({ width, onWidth }: { width: number; onWidth(next: number): void }) {
	const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
	const [active, setActive] = useState(false)

	return (
		<div
			data-testid="inspector-resize-handle"
			data-active={active ? 'true' : undefined}
			role="separator"
			aria-orientation="vertical"
			aria-valuenow={width}
			aria-valuemin={DOCK_WIDTH_MIN}
			aria-valuemax={DOCK_WIDTH_MAX}
			tabIndex={0}
			// WHY `z-10`: this handle straddles the dock's own left edge (half
			// outside it, half in), and it renders BEFORE the Tabs below it in
			// JSX — normal stacking paints that later sibling on top wherever
			// the two overlap, which silently ate every pointer event the
			// overlapping sliver received (measured: drag produced zero width
			// change, no console error, because the handle never saw the
			// pointerdown at all). A z-index lifts it above the tab bar/content
			// only in that shared strip; it never needs to beat a popover.
			className="absolute top-0 bottom-0 left-0 z-10 -ml-1 w-2 shrink-0 cursor-col-resize touch-none"
			onPointerDown={(event) => {
				// WHY `preventDefault()`: this `tabIndex={0}` div (Tab-navigable on
				// purpose, for the ArrowLeft/ArrowRight resize below) otherwise
				// takes DOM focus on the browser's own default mousedown behaviour
				// — and `document.activeElement` landing inside `[data-testid=
				// "inspector"]` is exactly what `Inspector.tsx`'s `InspectorPanel`
				// reads to decide "something in the dock is mid-edit, don't resync
				// the model to a new selection yet" (its own WHY there). A resize
				// drag is never mid-edit of a FIELD, but the freeze can't tell the
				// difference by DOM position alone — measured: select shape A,
                // select shape B, drag this handle, select A again — the panel kept
				// showing B's fields forever, because focus never left the handle
				// to let the freeze release. Suppressing the default focus-on-
				// mousedown here is what keeps a resize gesture from ever entering
				// that state; Tab-then-arrow-keys is unaffected (keyboard focus
				// navigation ignores a pointer event's preventDefault).
				event.preventDefault()
				event.currentTarget.setPointerCapture(event.pointerId)
				dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width }
				setActive(true)
			}}
			onPointerMove={(event) => {
				const drag = dragRef.current
				if (!drag || drag.pointerId !== event.pointerId) return
				// WHY subtract, not add: the handle sits on the dock's LEFT edge and
				// the dock is right-anchored (`right-0` in Inspector.tsx) — dragging
				// left (negative dx) has to WIDEN the dock, the mirror image of a
				// left-anchored panel's own splitter.
				const next = Math.round(drag.startWidth - (event.clientX - drag.startX))
				onWidth(Math.max(DOCK_WIDTH_MIN, Math.min(DOCK_WIDTH_MAX, next)))
			}}
			onPointerUp={(event) => {
				const drag = dragRef.current
				if (!drag || drag.pointerId !== event.pointerId) return
				try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* already released */ }
				dragRef.current = null
				setActive(false)
			}}
			onDoubleClick={() => onWidth(DOCK_WIDTH_DEFAULT)}
			onKeyDown={(event) => {
				if (event.key === 'ArrowLeft') onWidth(Math.min(DOCK_WIDTH_MAX, width + 8))
				if (event.key === 'ArrowRight') onWidth(Math.max(DOCK_WIDTH_MIN, width - 8))
			}}
		/>
	)
}

/** Persisted, seed-aware dock width — one hook so both Inspector and a
 *  future second dock share the exact same read/clamp/write rule. */
export function useDockWidth(): [number, (next: number) => void] {
	const [width, setWidth] = useState(readStoredDockWidth)
	useEffect(() => { writeStoredDockWidth(width) }, [width])
	return [width, setWidth]
}

/* --------------------------------------------------------- variant picker */

/**
 * Three 22px segments in the dock header — WHY a page reload rather than a
 * live re-theme: the variant swap changes layout decisions (inline prefixes,
 * Select-vs-segment thresholds), not just colour, and re-deriving every
 * open/closed Collapsible and draft-field state across that swap is a much
 * larger surface than "reload with `?variant=N`", which is also how Zach
 * already flips seed/preflight switches on this app (`readSeedMode`). Kept
 * on the SAME url otherwise — `variantUrl` only replaces the one param, so a
 * `?seed=stock` journey run stays seeded across the switch.
 */
/** Round 2: "1 2 3 · 4 5 6" — the two babble rounds stay visually grouped
 *  (a middle divider, not a wider single row) rather than merged into one
 *  run of six, so the picker itself keeps saying "these are two attempts",
 *  the same fact `VARIANTS[id].round` records. */
/** Below this dock width, the six-segment strip itself does not fit next
 *  to the header's own tabs/chevron — measured directly (auditor finding
 *  #3: the strip's own "6" segment sat off-screen at 240px, and the strip
 *  as a whole clipped 15px into the header at 280px) — so it collapses
 *  into one compact "V4" trigger instead. 300 is comfortably above both
 *  measured failures and below the width `VariantPicker`'s full strip is
 *  actually proven to fit at (`tests/inspector_smoke.mjs`'s existing
 *  240/280/360 sweeps). */
export const VARIANT_PICKER_COMPACT_MAX_DOCK_WIDTH = 300

export function VariantPicker({ current, dockWidth }: { current: VariantId; dockWidth: number }) {
	const id = useId()
	const roundOne: VariantId[] = [1, 2, 3]
	const roundTwo: VariantId[] = [4, 5, 6]
	// Round 3 is a single variant by design — see `isFigmaExactVariant`.
	const roundThree: VariantId[] = [7]
	const item = (variantId: VariantId) => (
		<a
			key={variantId}
			href={variantUrl(variantId)}
			role="radio"
			aria-checked={variantId === current}
			title={VARIANTS[variantId].name}
			data-testid={`inspector-variant-${variantId}`}
			data-state={variantId === current ? 'on' : 'off'}
			className={cn(segmentItemClass, 'no-underline')}
			aria-describedby={id}
		>
			{variantId}
		</a>
	)
	if (dockWidth < VARIANT_PICKER_COMPACT_MAX_DOCK_WIDTH) {
		// A plain native `<select>`, not `CompactSelect`/Base UI's own Select:
		// this is a NAVIGATION (a full-page reload to `?variant=N` — see
		// `variantUrl`'s own WHY), never a value the dock keeps state for, so
		// it needs none of Base UI's portal/positioning machinery — just an
		// `onChange` that reloads, and one that works even before hydration
		// finishes since it is real browser-native `<option>` markup.
		return (
			<select
				aria-label="Inspector variant"
				data-testid="inspector-variant-picker-compact"
				className={cn(panelFieldBase, 'h-[22px] w-14 px-1 text-[11px]')}
				value={current}
				onChange={(event) => { window.location.href = variantUrl(Number(event.target.value) as VariantId) }}
			>
				{[...roundOne, ...roundTwo, ...roundThree].map((variantId) => (
					<option key={variantId} value={variantId} data-testid={`inspector-variant-option-${variantId}`}>
						V{variantId} — {VARIANTS[variantId].name}
					</option>
				))}
			</select>
		)
	}
	return (
		<div role="radiogroup" aria-label="Inspector variant" className={cn(segmentRootClass)} data-testid="inspector-variant-picker">
			{roundOne.map(item)}
			<span aria-hidden="true" className="px-0.5 text-[10px] text-[var(--v-muted)]">·</span>
			{roundTwo.map(item)}
			<span aria-hidden="true" className="px-0.5 text-[10px] text-[var(--v-muted)]">·</span>
			{roundThree.map(item)}
			<span id={id} className="sr-only">Reloads the dock with the chosen variant's theme and layout.</span>
		</div>
	)
}
