/**
 * Figma's ui3 property-panel primitives, rebuilt from the live DOM Zach
 * pasted 2026-09-08 rather than from a screenshot.
 *
 * THE STRUCTURAL THING ROUND 1/2 GOT WRONG, and the reason this file exists:
 * Figma does NOT lay a row out as [caption][control][control]. It lays it out
 * as a two-ROW grid — a label row, then a control row — with a permanently
 * reserved trailing icon column. Read the real markup:
 *
 *     <fieldset>
 *       <span …x1lqevo4>Opacity</span>        ← label, column 1, row 1
 *       <div …xnrwi1y>  {opacity input}       ← control, column 1, row 2
 *       <span …x13udmme>Corner radius</span>  ← label, column 2, row 1
 *       <div …x14zgiex> {radius input}        ← control, column 2, row 2
 *       <div …x1cnu6j2> {individual corners}  ← icon, column 3, row 2
 *     </fieldset>
 *
 * That is why Zach could say "you don't list the text": in Figma EVERY
 * control carries a written label above it, and the two columns are labelled
 * independently. Round 1 hid the label inside the field as a glyph; round 2
 * put one shared caption over a pair. Both lose the words.
 *
 * The icon column is reserved whether or not a row has an icon — that is what
 * keeps X/Y/W/H/Opacity/Corner-radius all flush at the same right edge in
 * Zach's screenshot even though only two of those rows have a trailing button.
 */
import type { ReactNode } from 'react'
import { cn } from 'cn'

/* --------------------------------------------------------------- section */

/** A titled block. Figma separates these with a 1px rule, not whitespace. */
export function Section({ title, actions, children, className }: {
	title?: string
	actions?: ReactNode
	children: ReactNode
	className?: string
}) {
	return (
		<div className={cn('border-b border-[var(--fig-border)] px-4 py-2', className)}>
			{title ? (
				<div className="flex h-8 items-center justify-between">
					<h2 className="text-[11px] font-semibold text-[var(--fig-text)]">{title}</h2>
					{actions ? <div className="flex items-center gap-0.5">{actions}</div> : null}
				</div>
			) : null}
			<div className="flex flex-col gap-2">{children}</div>
		</div>
	)
}

/**
 * One labelled row. `left`/`right` are the two control columns; `leftLabel`/
 * `rightLabel` the words above them; `icon` the reserved trailing slot.
 *
 * WHY a real `<fieldset>`/`<legend>` when only ONE label is given: that is
 * exactly what Figma does (its Alignment/Position/Rotation rows are
 * fieldsets with a legend; only Appearance uses two bare label spans),
 * and it is also the correct grouping semantics for a pair of controls
 * that share a caption.
 */
export function Row({ leftLabel, rightLabel, left, right, icon, testId }: {
	leftLabel?: string
	rightLabel?: string
	left?: ReactNode
	right?: ReactNode
	icon?: ReactNode
	testId?: string
}) {
	const singleLabel = leftLabel && !rightLabel
	return (
		<div
			data-testid={testId}
			data-row=""
			// `grid-cols-[minmax(0,1fr)_minmax(0,1fr)_24px]`: two equal control
			// columns and the always-there 24px icon column. `minmax(0,…)` not a
			// bare `1fr` because a bare `1fr` refuses to shrink below its content
			// and would push the icon column off the panel at narrow widths —
			// the exact failure mode V5 hit at 240px in round 2.
			className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_24px] items-center gap-x-2 gap-y-1"
		>
			{leftLabel ? (
				<span className={cn(labelClass, singleLabel && 'col-span-3')}>{leftLabel}</span>
			) : null}
			{rightLabel ? <span className={labelClass}>{rightLabel}</span> : null}
			{/* When only ONE column is labelled the label spans and the controls
			    still start on the next line — hence the explicit col-start on
			    the control cells rather than relying on flow order. */}
			<div className="col-start-1 min-w-0">{left}</div>
			<div className="col-start-2 min-w-0">{right}</div>
			<div className="col-start-3 flex items-center justify-center">{icon}</div>
		</div>
	)
}

/** 11px, secondary ink, no uppercase — Figma labels are sentence case. */
export const labelClass = 'truncate text-[11px] leading-4 text-[var(--fig-text-secondary)]'

/* ----------------------------------------------------------------- field */

/**
 * The input shell: 24px tall, transparent until hovered, blue ring on focus.
 * Figma's own `raw_components--singleRowHeight` + `borderFocusWithin`.
 */
export function Field({ children, className, disabled, testId, title }: {
	children: ReactNode
	className?: string
	disabled?: boolean
	testId?: string
	title?: string
}) {
	return (
		<div
			data-testid={testId}
			title={title}
			className={cn(
				'flex h-6 min-w-0 items-center rounded-[5px] border border-transparent bg-transparent',
				'hover:border-[var(--fig-field-border)]',
				'focus-within:border-[var(--fig-focus)] focus-within:hover:border-[var(--fig-focus)]',
				disabled && 'pointer-events-none opacity-50',
				className,
			)}
		>
			{children}
		</div>
	)
}

/**
 * The leading slot of a field. Figma uses either a 24px icon or a single
 * letter (X, Y, W, H) at the same 24px width so every field's text starts on
 * the same x — copy that, it is why its number columns look like columns.
 */
export function FieldGlyph({ children, letter }: { children?: ReactNode; letter?: string }) {
	return (
		<div
			aria-hidden="true"
			className="flex size-6 shrink-0 items-center justify-center text-[11px] text-[var(--fig-text-secondary)] [&>svg]:size-6"
		>
			{letter ?? children}
		</div>
	)
}

/** The trailing unit (`px`, `%`, `°`). Muted, never clipped, never focusable. */
export function FieldSuffix({ children }: { children: ReactNode }) {
	return (
		<span aria-hidden="true" className="shrink-0 pr-1.5 text-[11px] text-[var(--fig-text-secondary)]">
			{children}
		</span>
	)
}

/* ---------------------------------------------------------- icon button */

/** 24×24, ghost, icon inherits `--fig-icon`. Figma's `icon-button__ghost`. */
export function IconButton({ label, onClick, active, disabled, children, testId }: {
	label: string
	onClick?: () => void
	active?: boolean
	/** Figma greys a button it cannot act with rather than hiding it — see
	 *  the alignment row's own WHY in FigmaExactPanel. */
	disabled?: boolean
	children: ReactNode
	testId?: string
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			data-testid={testId}
			aria-pressed={active}
			aria-disabled={disabled || undefined}
			disabled={disabled}
			onClick={onClick}
			// `text-[var(--fig-icon)]` explicitly: a <button> never inherits
			// `color` (Chromium's UA sheet hands it `buttontext`), the bug this
			// repo has now hit three times — see docs/log.md's own entry.
			className={cn(
				'flex size-6 shrink-0 items-center justify-center rounded-[5px] border-0 bg-transparent p-0 text-[var(--fig-icon)] outline-none',
				'hover:bg-[var(--fig-hover)]',
				active && 'bg-[var(--fig-selected-bg)]',
				disabled && 'pointer-events-none text-[var(--fig-icon-tertiary)] opacity-40',
			)}
		>
			{children}
		</button>
	)
}

/* ------------------------------------------------------ segmented group */

/**
 * Figma's `segmented_button--root`: a flush row of 24px icon buttons with NO
 * track behind them and no gap — the pressed one gets a filled rounded rect.
 * (Round 1 drew a filled track around the whole group; Figma does not.)
 */
export function SegmentedGroup({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div role="group" aria-label={label} className="flex items-center">
			{children}
		</div>
	)
}
