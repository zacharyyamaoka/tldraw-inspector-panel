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
import { useEffect, useId, useRef, useState } from 'react'
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
	'h-6 min-w-0 rounded border border-transparent bg-[var(--v-field)] text-[var(--v-surface)] outline-none ' +
	'hover:bg-[var(--v-field-hover)] focus-within:border-[var(--v-focus)] focus-within:bg-[var(--v-field-hover)] ' +
	'disabled:opacity-50'
export const panelIconButtonBase =
	'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent bg-transparent ' +
	'text-[var(--v-muted)] outline-none hover:bg-[var(--v-hover)] hover:text-[var(--v-surface)] ' +
	'focus-visible:border-[var(--v-focus)]'
export const segmentRootClass = 'inline-flex items-center gap-0.5 rounded bg-[var(--v-field)] p-0.5 hover:bg-[var(--v-field-hover)]'
export const segmentItemClass =
	'flex h-[22px] min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-sm px-1.5 text-[11px] ' +
	'text-[var(--v-muted)] outline-none hover:bg-[var(--v-hover)] hover:text-[var(--v-surface)] ' +
	'focus-visible:ring-1 focus-visible:ring-[var(--v-focus)] ' +
	'data-[state=on]:bg-[var(--v-hover)] data-[state=on]:text-[var(--v-surface)]'
export const sectionRootClass = 'border-b border-[var(--v-border)] px-3 pb-3'
export const sectionHeaderClass = 'grid h-8 min-w-0 items-center gap-1.5'
export const sectionTitleClass = 'text-[11px] font-semibold text-[var(--v-surface)]'
export const fieldGroupLabelClass = 'mb-1 block truncate text-[11px] leading-none text-[var(--v-muted)]'
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
	return (
		<div role="radiogroup" aria-label={ariaLabel} className={cn(segmentRootClass, 'w-full flex-wrap')}>
			{items.map((item) => (
				<button
					key={item.value}
					type="button"
					role="radio"
					aria-checked={item.value === value}
					aria-label={item.label}
					title={item.label}
					data-state={item.value === value ? 'on' : 'off'}
					data-testid={`${testIdPrefix}-${item.value}`}
					className={segmentItemClass}
					onClick={() => onChange(item.value)}
				>
					{item.icon ?? item.label}
				</button>
			))}
		</div>
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
}: {
	items: SegmentedItem[]
	value: string | undefined
	onChange(value: string): void
	testId: string
	ariaLabel: string
}) {
	return (
		<Select value={value} onValueChange={(next) => { if (next !== null) onChange(next) }}>
			<SelectTrigger
				data-testid={testId}
				aria-label={ariaLabel}
				className={cn(panelFieldBase, 'w-full justify-between px-1.5 text-[11px] data-[size=default]:h-6')}
			>
				<SelectValue />
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
export function VariantPicker({ current }: { current: VariantId }) {
	const id = useId()
	return (
		<div role="radiogroup" aria-label="Inspector variant" className={cn(segmentRootClass)} data-testid="inspector-variant-picker">
			{([1, 2, 3] as VariantId[]).map((variantId) => (
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
			))}
			<span id={id} className="sr-only">Reloads the dock with the chosen variant's theme and layout.</span>
		</div>
	)
}
