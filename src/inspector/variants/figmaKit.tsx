/**
 * Round 2's shared vocabulary: the Figma anatomy Zach specified element-by-
 * element (Fill/Stroke/Text/Position/Appearance/Geometry), mapped onto the
 * real `FieldSpec` ids `inspectorModel.ts` already exposes — never a new
 * model field. V4 "Figma rows" and V6 "Summary accordions" both draw these
 * exact lines (V6 as its expanded body); V5 "Icon strips" composes the same
 * ATOMS below into its own denser lines — see `figmaVariants.tsx`.
 *
 * WHY this needs `editor`, unlike round 1's `InspectorView` (deliberately
 * pure, no editor): the Fill/Stroke/Text colour lines have to resolve a
 * NAMED colour's theme swatch through the fill-STYLE-appropriate role
 * (`solid`/`semi`/`pattern`/`fill`/`linedFill`) — round 1's swatch grid only
 * ever needed `solid` (`paletteOptions` in inspectorModel.ts). Reading the
 * live theme is the only way to paint that swatch honestly.
 */
import { type MutableRefObject, useRef, useState } from 'react'
import { Popover as BasePopover } from '@base-ui/react/popover'
import { Eye, EyeOff, Minus, MoreHorizontal, Sun, X } from 'lucide-react'
import type { Editor } from 'tldraw'
import { cn } from 'cn'

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'

import { GEO_GLYPHS, STROKED_GLYPHS, FIELD_GLYPHS } from '../glyphs'
import type { InspectorControl, InspectorValue, PrimitiveInspectorModel } from '../inspectorModel'
import { ScrubNumber } from '../ScrubNumber'
import { TLDRAW_ICONS, TldrawIcon } from './tldrawIcons'
import {
	CompactSelect,
	IconButton,
	fieldGroupLabelClass,
	hexAlphaPercent,
	iconTileClass,
	panelFieldBase,
	panelIconButtonBase,
	SegmentedControl,
	sectionTitleClass,
	withHexAlphaPercent,
	type SegmentedItem,
} from './kit'

/** Every control the current selection offers, keyed by `FieldSpec` id —
 *  the round-2 anatomy reads specific ids by name (`x`, `fillColor`, `dash`,
 *  …) rather than iterating `model.groups` the way round 1's `GroupSection`
 *  does, because the Figma anatomy is a FIXED layout, not a generated one:
 *  a row that the model does not offer for this shape is simply absent from
 *  its line, never a hole in the layout. */
export function controlsById(model: PrimitiveInspectorModel): Map<string, InspectorControl> {
	const map = new Map<string, InspectorControl>()
	for (const group of model.groups) {
		for (const control of group.controls) map.set(control.id, control)
	}
	return map
}

export interface AnatomyCtx {
	editor: Editor
	controls: Map<string, InspectorControl>
	onChange(id: string, value: InspectorValue, gestureStart?: boolean): void
	onClear(id: string): void
	/** Where the Fill eye restores TO — tldraw's own value, remembered
	 *  across a "turn it off" round trip. Default `solid`, the brief's own
	 *  choice, since a freshly-selected shape has never had its fill turned
	 *  off in this session yet. */
	lastFillStyleRef: MutableRefObject<string>
	/** Same idea for the Stroke eye / `dash`. `draw` is this app's own seed
	 *  default (`src/board/seed.ts`), the same reasoning as `lastFillStyleRef`. */
	lastDashStyleRef: MutableRefObject<string>
}

/**
 * One ctx per mounted panel (V4/V5/V6 each call this once), so the "last
 * non-none style" refs live exactly as long as the shape stays selected —
 * switching shapes remounts a fresh dock and a fresh ref, which is fine:
 * there is nothing to restore FROM before a shape has been looked at.
 *
 * WHY the ref writes happen INLINE during render, not in a `useEffect`: an
 * effect fires strictly after commit, one render too late to have the
 * latest fill/dash value ready the moment the eye toggle's own `onClick`
 * closure (captured on THIS render) needs it. This is the same "compare
 * against a ref during render and adjust it" pattern `Inspector.tsx`'s
 * `InspectorPanel` already uses and cites React's own docs for.
 */
export function useAnatomyCtx(
	model: PrimitiveInspectorModel,
	editor: Editor,
	onChange: AnatomyCtx['onChange'],
	onClear: AnatomyCtx['onClear'],
): AnatomyCtx {
	const controls = controlsById(model)
	const lastFillStyleRef = useRef('solid')
	const lastDashStyleRef = useRef('draw')
	const fill = controls.get('fill')
	const dash = controls.get('dash')
	// eslint-disable-next-line react/refs -- see the WHY above; mirrors InspectorPanel's own sanctioned pattern.
	if (fill && typeof fill.value === 'string' && fill.value !== 'none') lastFillStyleRef.current = fill.value
	// eslint-disable-next-line react/refs
	if (dash && typeof dash.value === 'string' && dash.value !== 'none') lastDashStyleRef.current = dash.value
	return { editor, controls, onChange, onClear, lastFillStyleRef, lastDashStyleRef }
}

/* -------------------------------------------------------------- geometry --
 * Round 1's `Glyph`/`isColor` live in Inspector.tsx, which imports FROM this
 * file (via figmaVariants.tsx) — importing them back would be circular, so
 * the two tiny predicates this file also needs are duplicated here, the
 * same call `ThemePanel.tsx`'s own `ThemeColorField` already made (see
 * docs/log.md's M3 entry: "a theme role never has ColorRow's mixed/unset
 * states — forcing both through one prop contract would have cost more than
 * the duplication"). */
function isColorValue(value: string): boolean {
	if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true
	return CSS.supports('color', value)
}

function GeoGlyph({ name }: { name?: string }) {
	const drawn = name ? GEO_GLYPHS[name] : undefined
	if (!drawn) return <span className="text-[9px] text-[var(--v-muted)]">{name?.slice(0, 2) ?? '—'}</span>
	return (
		<svg
			viewBox="0 0 24 24"
			aria-hidden="true"
			className={cn('size-4 shrink-0', name && STROKED_GLYPHS.has(name) ? 'fill-none stroke-current stroke-[1.5]' : 'fill-current')}
		>
			<path d={drawn} />
		</svg>
	)
}

function FieldGlyphIcon({ name, className }: { name: string; className?: string }) {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true" className={cn('size-3.5 stroke-current fill-none stroke-[1.4]', className)}>
			<path d={FIELD_GLYPHS[name] ?? FIELD_GLYPHS.position} />
		</svg>
	)
}

/** tldraw's own theme, resolved to the fill-STYLE-appropriate role — the
 *  named colour "blue" is a pale wash at `semi`, the same hue solid at
 *  `solid`; the Figma anatomy's own swatch has to show which one is really
 *  painted, not always the same `solid` chip round 1's swatch grid drew. */
function resolveNamedSwatch(editor: Editor, name: string, styleValue?: string): string {
	try {
		const theme = editor.getCurrentTheme()
		const mode = editor.getColorMode()
		const roles = (theme.colors as unknown as Record<string, Record<string, Record<string, string>>>)?.[mode]?.[name]
		if (!roles) return '#888888'
		const key = styleValue === 'pattern' ? 'pattern'
			: styleValue === 'semi' ? 'semi'
			: styleValue === 'fill' ? 'fill'
			: styleValue === 'lined-fill' ? 'linedFill'
			: 'solid'
		return roles[key] ?? roles.solid ?? '#888888'
	} catch {
		return '#888888'
	}
}

/**
 * The tldraw MAPPING's own rule for every colour LINE (Fill, Stroke line 1,
 * Text line 5): swatch/text show the EXACT override when one is set, else
 * the named colour resolved through the live theme.
 */
export function effectiveColorReading(
	editor: Editor,
	namedControl: InspectorControl | undefined,
	exactControl: InspectorControl | undefined,
	styleValue: InspectorValue | null | undefined,
): { swatch: string; text: string } {
	if (exactControl && typeof exactControl.value === 'string' && exactControl.value) {
		return { swatch: exactControl.value, text: exactControl.value }
	}
	if (namedControl && typeof namedControl.value === 'string') {
		return { swatch: resolveNamedSwatch(editor, namedControl.value, typeof styleValue === 'string' ? styleValue : undefined), text: namedControl.value }
	}
	return { swatch: 'transparent', text: namedControl?.value === null ? 'Mixed' : 'default' }
}

/* ------------------------------------------------------------- line/section */

/** One horizontal band. `data-line` is the round-2 proof's own hook —
 *  `tests/inspector_smoke.mjs` counts `[data-section] [data-line]` against
 *  the targets Zach gave per variant; every band that reads as "one Figma
 *  line" carries it, whichever atoms it holds. */
export function Line({ children, testId }: { children: React.ReactNode; testId?: string }) {
	return (
		<div className="flex min-h-6 items-center gap-1.5" data-line="" data-testid={testId}>
			{children}
		</div>
	)
}

/** V4's always-visible section and V6's expanded accordion body share this
 *  shell — no chevron, no collapse: V4's own brief says "always-visible",
 *  and V6 draws its OWN disclosure one level up (`figmaVariants.tsx`'s
 *  `AccordionSection`), so nesting a second collapse control here would be
 *  two disclosures doing one job. `data-section` is the proof's other hook. */
export function AnatomySection({ id, title, children, testId }: { id: string; title: string; children: React.ReactNode; testId?: string }) {
	return (
		<div className="flex flex-col gap-1.5 border-b border-[var(--v-border)] px-3 py-2" data-section={id} data-testid={testId}>
			<span className={sectionTitleClass}>{title}</span>
			{children}
		</div>
	)
}

/** A caption row Zach's own anatomy draws ABOVE a line (Line height ·
 *  Padding) — explicitly does NOT count as its own line (the brief's own
 *  words: "that pair of captions does not count as a line"), so it carries
 *  no `data-line`. */
export function FieldCaption({ label }: { label: string }) {
	return <span className={cn(fieldGroupLabelClass, 'mb-0')}>{label}</span>
}

/* -------------------------------------------------------------- number/text */

export function NumberCell({ control, ctx, className }: { control: InspectorControl; ctx: AnatomyCtx; className?: string }) {
	return (
		<div className={className ?? 'min-w-0 flex-1'}>
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
				onChange={(value, gestureStart) => ctx.onChange(control.id, value, gestureStart)}
			/>
		</div>
	)
}

/** A raw text field, styled to the same 24px row rhythm every other control
 *  keeps — round 1's shadcn `Input` runs taller (`h-7`, its own padding),
 *  which is exactly what would break Zach's own "match Figma's compactness"
 *  verdict on the one control this round adds text rows for (Typeface, the
 *  Link/`…` popover rows). Drafted, committed on blur/Enter — the same
 *  history-per-keystroke reasoning `Inspector.tsx`'s `TextRow` documents. */
export function TextCell({ control, ctx, placeholder, testId }: { control: InspectorControl; ctx: AnatomyCtx; placeholder?: string; testId?: string }) {
	const [draft, setDraft] = useState<string | null>(null)
	const current = typeof control.value === 'string' ? control.value : ''
	const commit = (raw: string) => {
		setDraft(null)
		const next = raw.trim()
		if (next === current) return
		ctx.onChange(control.id, next)
	}
	return (
		<input
			spellCheck={false}
			value={draft ?? current}
			placeholder={placeholder ?? (control.unset ? 'default' : control.value === null ? 'Mixed' : '')}
			aria-label={control.label}
			data-testid={testId ?? `inspector-text-${control.id}`}
			className={cn(panelFieldBase, 'h-6 min-w-0 flex-1 px-1.5 text-[11px]')}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={(event) => commit(event.currentTarget.value)}
			onKeyDown={(event) => {
				if (event.key === 'Enter') commit(event.currentTarget.value)
				if (event.key === 'Escape') setDraft(null)
			}}
		/>
	)
}

/* ------------------------------------------------------------------ toggle */

export function ToggleIconButton({
	control,
	ctx,
	icon,
	activeIcon,
	label,
	testId,
}: {
	control: InspectorControl
	ctx: AnatomyCtx
	icon: React.ReactNode
	activeIcon?: React.ReactNode
	label: string
	testId?: string
}) {
	const on = control.value === true
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						data-testid={testId ?? `inspector-toggle-${control.id}`}
						aria-pressed={on}
						aria-label={label}
						data-state={on ? 'on' : 'off'}
						className={iconTileClass}
						onClick={() => ctx.onChange(control.id, !on)}
					/>
				}
			>
				{on && activeIcon ? activeIcon : icon}
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}

export function EyeToggle({ on, testId, label, onToggle }: { on: boolean; testId: string; label: string; onToggle(): void }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						data-testid={testId}
						aria-pressed={on}
						aria-label={label}
						className={cn(panelIconButtonBase, 'size-5')}
						onClick={onToggle}
					/>
				}
			>
				{on ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}

export function MinusButton({ testId, label, onClick }: { testId: string; label: string; onClick(): void }) {
	return (
		<IconButton title={label} data-testid={testId} className="size-5" onClick={onClick}>
			<Minus className="size-3.5" />
		</IconButton>
	)
}

/* -------------------------------------------------------- colour picker --- */

/**
 * Figma's own picker anatomy, the parts the tldraw MAPPING actually binds
 * to something real: the fill-STYLE icon row (tldraw's own fill styles —
 * Figma's "Solid/Gradient/Image" row, in this engine's terms), the
 * saturation/hue/alpha square (`react-colorful`'s `HexAlphaColorPicker`,
 * round 1's own choice, reused), a hex + alpha % row, and the "On this
 * page" default-swatch strip that writes the NAMED colour and clears the
 * exact override.
 *
 * Deliberately NOT built: the "Custom | Libraries" header tabs and the
 * header `+`/"styles" grid icon Zach's screenshot shows. Neither maps to
 * anything this app's model has — one palette, no libraries, no per-fill
 * style presets beyond the six StyleProp values already drawn as icons
 * below — and this repo's own round-1 rule is explicit about the
 * alternative: "a control that does nothing is a lie" (docs/log.md, the `+`
 * button already rejected the same way for the same reason).
 */
export function ColorPickerPopover({
	ctx,
	triggerTestId,
	label,
	swatch,
	exactControl,
	namedControl,
	styleControl,
}: {
	ctx: AnatomyCtx
	triggerTestId: string
	label: string
	swatch: string
	exactControl?: InspectorControl
	namedControl?: InspectorControl
	styleControl?: InspectorControl
}) {
	const hex = /^#[0-9a-f]{6,8}$/i.test(swatch) ? swatch : '#00000000'
	return (
		<Popover>
			<PopoverTrigger
				render={
					<button
						type="button"
						aria-label={`${label} picker`}
						data-testid={triggerTestId}
						className="size-4 shrink-0 rounded-sm border border-[var(--v-border)]"
						style={{ background: swatch }}
					/>
				}
			/>
			<PopoverContent className="flex w-56 flex-col gap-2 p-2">
				<div className="flex items-center justify-between">
					<span className="text-[11px] font-medium text-[var(--v-surface)]">{label}</span>
					<BasePopover.Close
						render={
							<button type="button" title="Close" aria-label="Close" data-testid={`${triggerTestId}-close`} className={cn(panelIconButtonBase, 'size-5')} />
						}
					>
						<X className="size-3.5" />
					</BasePopover.Close>
				</div>
				{styleControl ? (
					<TooltipProvider>
						<div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Fill style">
							{(styleControl.options ?? []).map((option) => (
								<Tooltip key={option.value}>
									<TooltipTrigger
										render={
											<button
												type="button"
												role="radio"
												aria-checked={option.value === styleControl.value}
												data-testid={`inspector-fillstyle-${option.value}`}
												data-state={option.value === styleControl.value ? 'on' : 'off'}
												className={iconTileClass}
												onClick={() => ctx.onChange(styleControl.id, option.value)}
											/>
										}
									>
										{TLDRAW_ICONS.fill?.[option.value] ? <TldrawIcon id="fill" value={option.value} className="size-4 shrink-0" /> : option.label.slice(0, 2)}
									</TooltipTrigger>
									<TooltipContent>{option.label}</TooltipContent>
								</Tooltip>
							))}
						</div>
					</TooltipProvider>
				) : null}
				<HexAlphaColorPickerLazy
					color={hex === '#00000000' ? '#000000ff' : hex}
					onChange={(next) => exactControl && ctx.onChange(exactControl.id, next)}
				/>
				<div className="flex items-center gap-1.5">
					<input
						spellCheck={false}
						defaultValue={exactControl && typeof exactControl.value === 'string' ? exactControl.value : ''}
						placeholder={swatch !== 'transparent' ? swatch : ''}
						data-testid={`${triggerTestId}-hex`}
						aria-label={`${label} hex`}
						className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[11px] text-[var(--v-surface)] outline-none"
						onBlur={(event) => {
							if (!exactControl) return
							const next = event.target.value.trim()
							if (next === '') { ctx.onClear(exactControl.id); return }
							if (isColorValue(next)) ctx.onChange(exactControl.id, next)
						}}
						// WHY `onKeyDown` too, on top of `onBlur` above: this field lives
						// inside a Base UI `Popover`, which stays open on Enter — nothing
						// here dismisses it — so without this, pressing Enter did nothing
						// observable and the value only committed on the NEXT blur. Every
						// other text-commit row in this dock (`TextRow`, `ColorRow`,
						// `TextCell`) already takes an Enter-commits contract; this one
						// had been missed.
						onKeyDown={(event) => {
							if (!exactControl || event.key !== 'Enter') return
							const next = event.currentTarget.value.trim()
							if (next === '') { ctx.onClear(exactControl.id); return }
							if (isColorValue(next)) ctx.onChange(exactControl.id, next)
						}}
					/>
					{exactControl ? (
						<div className="w-14 shrink-0">
							<ScrubNumber
								value={typeof exactControl.value === 'string' ? hexAlphaPercent(exactControl.value) : null}
								unset={!exactControl.value}
								min={0}
								max={100}
								step={1}
								unit="%"
								fallback={100}
								label={`${label} alpha`}
								testId={`${triggerTestId}-pickeralpha`}
								onChange={(percent) => ctx.onChange(exactControl.id, withHexAlphaPercent(String(exactControl.value || swatch || '#000000'), percent))}
							/>
						</div>
					) : null}
				</div>
				{namedControl ? (
					<div className="flex flex-col gap-1">
						<span className={fieldGroupLabelClass}>On this page</span>
						<div className="grid grid-cols-7 gap-1" role="radiogroup" aria-label="Default colours">
							{(namedControl.options ?? []).map((option) => (
								<BasePopover.Close
									key={option.value}
									render={
										<button
											type="button"
											role="radio"
											aria-checked={option.value === namedControl.value}
											aria-label={option.label}
											data-testid={`inspector-defaultswatch-${namedControl.id}-${option.value}`}
											className="size-5 rounded-full border border-[var(--v-border)]"
											style={{ background: option.swatch }}
											onClick={() => {
												ctx.onChange(namedControl.id, option.value)
												if (exactControl) ctx.onClear(exactControl.id)
											}}
										/>
									}
								/>
							))}
						</div>
					</div>
				) : null}
			</PopoverContent>
		</Popover>
	)
}

// Lazy indirection around react-colorful's own component so this file's own
// import stays a single, direct, top-level one (matching Inspector.tsx's own
// `HexAlphaColorPicker` import) — re-exported under a distinct name only so
// the JSDoc above the popover doesn't read as describing a wrapper that adds
// behaviour it does not.
import { HexAlphaColorPicker as HexAlphaColorPickerLazy } from 'react-colorful'

/* ------------------------------------------------------------- dash/size --- */

export function DashSelect({ control, ctx }: { control: InspectorControl; ctx: AnatomyCtx }) {
	const items: SegmentedItem[] = (control.options ?? []).map((option) => ({
		value: option.value,
		label: option.label,
		icon: TLDRAW_ICONS.dash?.[option.value] ? <TldrawIcon id="dash" value={option.value} className="size-4 shrink-0" /> : undefined,
	}))
	return (
		<div className="min-w-0 flex-1">
			<CompactSelect
				items={items}
				value={typeof control.value === 'string' ? control.value : undefined}
				onChange={(value) => ctx.onChange(control.id, value)}
				testId={`inspector-dashselect-${control.id}`}
				ariaLabel={control.label}
			/>
		</div>
	)
}

/**
 * Figma's "Weight" slot: one control that reads "M" or "3.5 px" — the
 * `size` rung by default, an "Exact…" item that reveals the real
 * `strokeWidth` px field. Once that field carries a real override, THAT is
 * what the control shows on the next render (`exactControl.overridden`),
 * matching the anatomy's own words ("exact strokeWidth px field when
 * overridden, else the size rung").
 */
export function WeightSelect({ sizeControl, exactControl, ctx, width = 'w-16' }: { sizeControl?: InspectorControl; exactControl?: InspectorControl; ctx: AnatomyCtx; width?: string }) {
	const [forceExact, setForceExact] = useState(false)
	const isExact = exactControl && (forceExact || exactControl.overridden)
	if (isExact && exactControl) {
		return (
			<div className="flex min-w-0 flex-1 items-center gap-1">
				<NumberCell control={exactControl} ctx={ctx} />
				<IconButton
					title="Back to the size rung"
					data-testid="inspector-weight-back"
					className="size-5"
					onClick={() => { ctx.onClear(exactControl.id); setForceExact(false) }}
				>
					<FieldGlyphIcon name="weight" className="size-3" />
				</IconButton>
			</div>
		)
	}
	if (!sizeControl) return null
	const items: SegmentedItem[] = [
		...(sizeControl.options ?? []).map((option) => ({ value: option.value, label: option.label.toUpperCase() })),
		{ value: '__exact__', label: 'Exact…' },
	]
	return (
		<div className={cn(width, 'shrink-0')}>
			<CompactSelect
				items={items}
				value={typeof sizeControl.value === 'string' ? sizeControl.value : undefined}
				onChange={(value) => { if (value === '__exact__') { setForceExact(true); return } ctx.onChange(sizeControl.id, value) }}
				testId="inspector-weightselect"
				ariaLabel="Stroke weight"
			/>
		</div>
	)
}

/** Round 2 coordinator brief's own words: drawn disabled rather than
 *  dropped when the shape offers no `labelFontWeight` row (only a `text`
 *  shape does) — "show disabled when the shape has no weight row." A
 *  round-1 row this same file would normally omit outright (the model's own
 *  "a control that does nothing is a lie" rule); this one control is a
 *  named exception in this round's own spec, not a lapse of that rule. */
export function WeightWordSelect({ control, ctx }: { control?: InspectorControl; ctx: AnatomyCtx }) {
	const items: SegmentedItem[] = ['300', '400', '500', '600', '700', '800'].map((value) => ({ value, label: value }))
	return (
		<div className="w-16 shrink-0">
			<CompactSelect
				items={items}
				value={typeof control?.value === 'string' ? control.value : undefined}
				onChange={(value) => control && ctx.onChange(control.id, value)}
				testId="inspector-weightword"
				ariaLabel="Label weight"
				disabled={!control}
			/>
		</div>
	)
}

export function SegmentedIconRow({ control, ctx }: { control: InspectorControl; ctx: AnatomyCtx }) {
	const items: SegmentedItem[] = (control.options ?? []).map((option) => ({
		value: option.value,
		label: option.label,
		icon: TLDRAW_ICONS[control.id]?.[option.value] ? <TldrawIcon id={control.id} value={option.value} className="size-4 shrink-0" /> : undefined,
	}))
	return (
		<div className="min-w-0 flex-1">
			<SegmentedControl
				items={items}
				value={typeof control.value === 'string' ? control.value : undefined}
				onChange={(value) => ctx.onChange(control.id, value)}
				testIdPrefix={`inspector-figmaseg-${control.id}`}
				ariaLabel={control.label}
			/>
		</div>
	)
}

/* --------------------------------------------------------------- geometry */

export function GeometrySelect({ control, ctx, className }: { control: InspectorControl; ctx: AnatomyCtx; className?: string }) {
	const current = typeof control.value === 'string' ? control.value : undefined
	const options = control.options ?? []
	return (
		<Popover>
			<PopoverTrigger
				render={
					<button
						type="button"
						data-testid={`inspector-geoselect-${control.id}`}
						aria-label={control.label}
						className={cn(panelFieldBase, 'flex h-6 items-center gap-1.5 px-1.5 text-[11px]', className ?? 'w-full')}
					>
						<GeoGlyph name={current} />
						<span className="min-w-0 flex-1 truncate text-left">{current ?? 'Mixed'}</span>
					</button>
				}
			/>
			<PopoverContent className="w-auto p-1.5">
				<div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label={control.label}>
					{options.map((option) => (
						<BasePopover.Close
							key={option.value}
							render={
								<button
									type="button"
									role="radio"
									aria-checked={option.value === current}
									aria-label={option.label}
									data-testid={`inspector-geotile-${option.value}`}
									data-state={option.value === current ? 'on' : 'off'}
									className={iconTileClass}
									onClick={() => ctx.onChange(control.id, option.value)}
								/>
							}
						>
							<GeoGlyph name={option.value} />
						</BasePopover.Close>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}

/* ---------------------------------------------------------------- popover */

/** A field with its label, drawn inside a "…" popover — the anatomy's own
 *  home for `scale`/`growY`/`url` (Appearance) and
 *  `labelEdgeMargin`/`labelMinWidth` (Text): real controls, just not
 *  important enough to cost their own always-visible line. */
export function PopoverFieldRow({ control, ctx }: { control: InspectorControl; ctx: AnatomyCtx }) {
	return (
		<div className="flex items-center gap-1.5" data-testid={`inspector-popoverrow-${control.id}`}>
			<span className="w-24 shrink-0 truncate text-[11px] text-[var(--v-muted)]" title={control.hint ?? control.label}>{control.label}</span>
			<div className="min-w-0 flex-1">
				{control.kind === 'text' ? <TextCell control={control} ctx={ctx} /> : <NumberCell control={control} ctx={ctx} />}
			</div>
		</div>
	)
}

export function MorePopover({ ctx, controls, testId, title }: { ctx: AnatomyCtx; controls: InspectorControl[]; testId: string; title: string }) {
	if (controls.length === 0) return null
	return (
		<Popover>
			<PopoverTrigger
				render={
					<button type="button" title={title} aria-label={title} data-testid={testId} className={cn(panelIconButtonBase, 'size-5 shrink-0')} />
				}
			>
				<MoreHorizontal className="size-3.5" />
			</PopoverTrigger>
			<PopoverContent className="flex w-56 flex-col gap-1.5 p-2">
				{controls.map((control) => <PopoverFieldRow key={control.id} control={control} ctx={ctx} />)}
			</PopoverContent>
		</Popover>
	)
}

export function CornerPopover({ control, ctx }: { control: InspectorControl; ctx: AnatomyCtx }) {
	return (
		<Popover>
			<PopoverTrigger
				render={
					<button type="button" title="Corner roundness" aria-label="Corner roundness" data-testid={`inspector-cornerpopover-${control.id}`} className={cn(panelIconButtonBase, 'size-5 shrink-0')} />
				}
			>
				<FieldGlyphIcon name="radius" />
			</PopoverTrigger>
			<PopoverContent className="w-48 p-2">
				<PopoverFieldRow control={control} ctx={ctx} />
			</PopoverContent>
		</Popover>
	)
}

export function HaloToggle({ control, ctx }: { control: InspectorControl; ctx: AnatomyCtx }) {
	return <ToggleIconButton control={control} ctx={ctx} icon={<Sun className="size-3.5" />} label="White halo" />
}

export { GeoGlyph, FieldGlyphIcon }
