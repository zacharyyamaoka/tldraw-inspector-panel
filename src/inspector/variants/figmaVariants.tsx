/**
 * V4 "Figma rows", V5 "Icon strips", V6 "Summary accordions" — round 2's
 * three answers to Zach's verdict on round 1 ("very similar… aim for
 * Figma's compactness, measured in LINE COUNT per section"). All three read
 * the exact Figma anatomy Zach specified (Position/Appearance/Geometry/
 * Fill/Stroke/Text) through `figmaKit.tsx`'s shared atoms — what differs
 * between them is which atoms land on which line, and whether a section is
 * always open, collapsed to a strip, or an accordion summary. None of the
 * three touches `inspectorModel.ts`.
 */
import { useState } from 'react'
import type { Editor } from 'tldraw'
import { ChevronRight, FlipHorizontal2, FlipVertical2, Lock, LockOpen } from 'lucide-react'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'
import { Field, FieldDescription } from '@/components/ui/field'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible'

import type { InspectorControl, InspectorValue, PrimitiveInspectorModel } from '../inspectorModel'
import {
	type AnatomyCtx,
	AnatomySection,
	ColorPickerPopover,
	CornerPopover,
	DashSelect,
	EyeToggle,
	FieldCaption,
	GeometrySelect,
	HaloToggle,
	Line,
	MinusButton,
	MorePopover,
	NumberCell,
	SegmentedIconRow,
	TextCell,
	ToggleIconButton,
	WeightSelect,
	WeightWordSelect,
	controlsById,
	effectiveColorReading,
	useAnatomyCtx,
} from './figmaKit'
import { CompactSelect, hexAlphaPercent, sectionTitleClass, withHexAlphaPercent } from './kit'
import type { VariantId } from './theme'
import { TLDRAW_ICONS, TldrawIcon } from './tldrawIcons'
import { ScrubNumber } from '../ScrubNumber'

/* ------------------------------------------------------------------ font -- */

/** Text line 1: the font Select, plus a "Typeface…" item that swaps in the
 *  real `labelFontFamily` text field beneath it (its own line, only while
 *  revealed — see `figmaKit.tsx`'s `AnatomyCtx`/line-count proof). */
function FontLines({ font, typeface, ctx }: { font: InspectorControl; typeface: InspectorControl | undefined; ctx: AnatomyCtx }) {
	const [showTypeface, setShowTypeface] = useState(Boolean(typeface?.overridden))
	const items = [
		...(font.options ?? []).map((option) => ({
			value: option.value,
			label: option.label,
			icon: TLDRAW_ICONS.font?.[option.value] ? <TldrawIcon id="font" value={option.value} className="size-4 shrink-0" /> : undefined,
		})),
		...(typeface ? [{ value: '__typeface__', label: 'Typeface…' }] : []),
	]
	return (
		<>
			<Line testId="inspector-line-text-font">
				<div className="min-w-0 flex-1">
					<CompactSelect
						items={items}
						value={showTypeface ? '__typeface__' : (typeof font.value === 'string' ? font.value : undefined)}
						onChange={(value) => {
							if (value === '__typeface__') { setShowTypeface(true); return }
							setShowTypeface(false)
							ctx.onChange(font.id, value)
						}}
						testId="inspector-fontselect"
						ariaLabel="Font"
					/>
				</div>
			</Line>
			{showTypeface && typeface ? (
				<Line testId="inspector-line-text-typeface">
					<TextCell control={typeface} ctx={ctx} placeholder="Inter, sans-serif" testId="inspector-typefacefield" />
				</Line>
			) : null}
		</>
	)
}

/* --------------------------------------------------------- shared anatomy -- */

function positionLines(ctx: AnatomyCtx): React.ReactNode[] {
	const { controls } = ctx
	const x = controls.get('x')
	const y = controls.get('y')
	const w = controls.get('w')
	const h = controls.get('h')
	const rotation = controls.get('rotation')
	const flipX = controls.get('flipX')
	const flipY = controls.get('flipY')
	const isLocked = controls.get('isLocked')
	const lines: React.ReactNode[] = []
	if (x || y) lines.push(<Line key="xy" testId="inspector-line-xy">{x && <NumberCell control={x} ctx={ctx} />}{y && <NumberCell control={y} ctx={ctx} />}</Line>)
	if (w || h) lines.push(<Line key="wh" testId="inspector-line-wh">{w && <NumberCell control={w} ctx={ctx} />}{h && <NumberCell control={h} ctx={ctx} />}</Line>)
	if (rotation || flipX || flipY || isLocked) {
		lines.push(
			<Line key="rotate" testId="inspector-line-rotate">
				{rotation && <NumberCell control={rotation} ctx={ctx} />}
				{flipX && <ToggleIconButton control={flipX} ctx={ctx} icon={<FlipHorizontal2 className="size-3.5" />} label="Flip X" />}
				{flipY && <ToggleIconButton control={flipY} ctx={ctx} icon={<FlipVertical2 className="size-3.5" />} label="Flip Y" />}
				{isLocked && <ToggleIconButton control={isLocked} ctx={ctx} icon={isLocked.value ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />} label="Locked" />}
			</Line>,
		)
	}
	return lines
}

function appearanceLine(ctx: AnatomyCtx): React.ReactNode | null {
	const { controls } = ctx
	const opacity = controls.get('opacity')
	const cornerRadius = controls.get('cornerRadius')
	if (!opacity && !cornerRadius) return null
	const more = [controls.get('scale'), controls.get('growY'), controls.get('url')].filter((c): c is InspectorControl => Boolean(c))
	return (
		<Line key="appearance" testId="inspector-line-appearance">
			{opacity && <NumberCell control={opacity} ctx={ctx} />}
			{cornerRadius && <NumberCell control={cornerRadius} ctx={ctx} />}
			<MorePopover ctx={ctx} controls={more} testId="inspector-more-appearance" title="Scale, grown height, link" />
		</Line>
	)
}

function geometryLine(ctx: AnatomyCtx): React.ReactNode | null {
	const geo = ctx.controls.get('geo')
	if (!geo) return null
	return <Line key="geometry" testId="inspector-line-geometry"><GeometrySelect control={geo} ctx={ctx} /></Line>
}

function fillLines(ctx: AnatomyCtx): React.ReactNode[] {
	const { controls } = ctx
	const fill = controls.get('fill')
	const color = controls.get('color')
	const fillColor = controls.get('fillColor')
	const fillOpacity = controls.get('fillOpacity')
	if (!color && !fillColor) return []
	const { swatch, text } = effectiveColorReading(ctx.editor, color, fillColor, fill?.value)
	const overridden = Boolean(fillColor?.overridden || fillOpacity?.overridden)
	return [
		<Line key="fill" testId="inspector-line-fill">
			<ColorPickerPopover ctx={ctx} triggerTestId="inspector-fillswatch" label="Fill" swatch={swatch} exactControl={fillColor} namedControl={color} styleControl={fill} />
			<span className="min-w-0 flex-1 truncate text-[11px] text-[var(--v-surface)]" data-testid="inspector-fill-name">{text}</span>
			{fillOpacity ? (
				<div className="w-14 shrink-0">
					<ScrubNumber
						value={typeof fillOpacity.value === 'number' ? fillOpacity.value * 100 : null}
						unset={fillOpacity.unset}
						min={0} max={100} step={1} unit="%"
						fallback={(fillOpacity.fallback ?? 1) * 100}
						label="Fill alpha"
						testId="fillOpacityPercent"
						onChange={(percent) => ctx.onChange('fillOpacity', percent / 100)}
					/>
				</div>
			) : null}
			{fill ? (
				<EyeToggle
					on={fill.value !== 'none'}
					testId="inspector-fill-eye"
					label="Fill visible"
					onToggle={() => ctx.onChange('fill', fill.value === 'none' ? ctx.lastFillStyleRef.current : 'none')}
				/>
			) : null}
			{overridden ? (
				<MinusButton
					testId="inspector-fill-minus"
					label="Reset fill overrides"
					onClick={() => { if (fillColor?.overridden) ctx.onClear('fillColor'); if (fillOpacity?.overridden) ctx.onClear('fillOpacity') }}
				/>
			) : null}
		</Line>,
	]
}

function strokeLines(ctx: AnatomyCtx): React.ReactNode[] {
	const { controls } = ctx
	const dash = controls.get('dash')
	const color = controls.get('color')
	const strokeColor = controls.get('strokeColor')
	const strokeWidth = controls.get('strokeWidth')
	const size = controls.get('size')
	const strokeRoundness = controls.get('strokeRoundness')
	if (!color && !strokeColor) return []
	const { swatch, text } = effectiveColorReading(ctx.editor, color, strokeColor, undefined)
	const line1 = (
		<Line key="stroke-1" testId="inspector-line-stroke-color">
			<ColorPickerPopover ctx={ctx} triggerTestId="inspector-strokeswatch" label="Stroke" swatch={swatch} exactControl={strokeColor} namedControl={color} />
			<span className="min-w-0 flex-1 truncate text-[11px] text-[var(--v-surface)]" data-testid="inspector-stroke-name">{text}</span>
			{strokeColor ? (
				<div className="w-14 shrink-0">
					<ScrubNumber
						value={typeof strokeColor.value === 'string' ? hexAlphaPercent(strokeColor.value) : null}
						unset={!strokeColor.value}
						min={0} max={100} step={1} unit="%"
						fallback={100}
						label="Stroke alpha"
						testId="strokeAlphaPercent"
						onChange={(percent) => ctx.onChange('strokeColor', withHexAlphaPercent(String(strokeColor.value || swatch || '#000000'), percent))}
					/>
				</div>
			) : null}
			{dash ? (
				<EyeToggle
					on={dash.value !== 'none'}
					testId="inspector-stroke-eye"
					label="Outline visible"
					onToggle={() => ctx.onChange('dash', dash.value === 'none' ? ctx.lastDashStyleRef.current : 'none')}
				/>
			) : null}
			{strokeColor?.overridden ? (
				<MinusButton testId="inspector-stroke-minus" label="Reset stroke colour" onClick={() => ctx.onClear('strokeColor')} />
			) : null}
		</Line>
	)
	const line2Items: React.ReactNode[] = []
	if (dash) line2Items.push(<DashSelect key="dash" control={dash} ctx={ctx} />)
	if (strokeWidth || size) line2Items.push(<WeightSelect key="weight" sizeControl={size} exactControl={strokeWidth} ctx={ctx} />)
	if (strokeRoundness) line2Items.push(<CornerPopover key="corner" control={strokeRoundness} ctx={ctx} />)
	const line2 = line2Items.length > 0 ? <Line key="stroke-2" testId="inspector-line-stroke-weight">{line2Items}</Line> : null
	return line2 ? [line1, line2] : [line1]
}

function textLines(ctx: AnatomyCtx): React.ReactNode[] {
	const { controls } = ctx
	const font = controls.get('font')
	const labelFontWeight = controls.get('labelFontWeight')
	const labelFontSize = controls.get('labelFontSize')
	const labelLineHeight = controls.get('labelLineHeight')
	const labelPadding = controls.get('labelPadding')
	const labelEdgeMargin = controls.get('labelEdgeMargin')
	const labelMinWidth = controls.get('labelMinWidth')
	const align = controls.get('align')
	const verticalAlign = controls.get('verticalAlign')
	const textOutline = controls.get('textOutline')
	const labelColorProp = controls.get('labelColorProp')
	const labelColor = controls.get('labelColor')
	const labelFontFamily = controls.get('labelFontFamily')

	if (!font && !labelColorProp && !labelColor) return []

	const lines: React.ReactNode[] = []

	if (font) lines.push(<FontLines key="font" font={font} typeface={labelFontFamily} ctx={ctx} />)

	if (labelFontWeight || labelFontSize) {
		lines.push(
			<Line key="text-weight-size" testId="inspector-line-text-weight-size">
				<WeightWordSelect control={labelFontWeight} ctx={ctx} />
				{labelFontSize ? <NumberCell control={labelFontSize} ctx={ctx} /> : null}
			</Line>,
		)
	}

	if (labelLineHeight || labelPadding) {
		const more = [labelEdgeMargin, labelMinWidth].filter((c): c is InspectorControl => Boolean(c))
		lines.push(
			<div key="text-fit" className="flex flex-col gap-0.5">
				<FieldCaption label="Line height · Padding" />
				<Line testId="inspector-line-text-fit">
					{labelLineHeight ? <NumberCell control={labelLineHeight} ctx={ctx} /> : null}
					{labelPadding ? <NumberCell control={labelPadding} ctx={ctx} /> : null}
					<MorePopover ctx={ctx} controls={more} testId="inspector-more-labelfit" title="Label edge margin, minimum width" />
				</Line>
			</div>,
		)
	}

	if (align || verticalAlign || textOutline) {
		lines.push(
			<Line key="text-align" testId="inspector-line-text-align">
				{align ? <SegmentedIconRow control={align} ctx={ctx} /> : null}
				{verticalAlign ? <SegmentedIconRow control={verticalAlign} ctx={ctx} /> : null}
				{textOutline ? <HaloToggle control={textOutline} ctx={ctx} /> : null}
			</Line>,
		)
	}

	if (labelColorProp || labelColor) {
		const { swatch, text } = effectiveColorReading(ctx.editor, labelColorProp, labelColor, undefined)
		lines.push(
			<Line key="text-color" testId="inspector-line-text-color">
				<ColorPickerPopover ctx={ctx} triggerTestId="inspector-labelswatch" label="Label" swatch={swatch} exactControl={labelColor} namedControl={labelColorProp} />
				<span className="min-w-0 flex-1 truncate text-[11px] text-[var(--v-surface)]" data-testid="inspector-label-name">{text}</span>
				{labelColor ? (
					<div className="w-14 shrink-0">
						<ScrubNumber
							value={typeof labelColor.value === 'string' ? hexAlphaPercent(labelColor.value) : null}
							unset={!labelColor.value}
							min={0} max={100} step={1} unit="%"
							fallback={100}
							label="Label alpha"
							testId="labelAlphaPercent"
							onChange={(percent) => ctx.onChange('labelColor', withHexAlphaPercent(String(labelColor.value || swatch || '#000000'), percent))}
						/>
					</div>
				) : null}
				{labelColor?.overridden ? <MinusButton testId="inspector-label-minus" label="Reset ink override" onClick={() => ctx.onClear('labelColor')} /> : null}
			</Line>,
		)
	}

	return lines
}

/* -------------------------------------------------------------------- V4 -- */

function V4Sections({ ctx }: { ctx: AnatomyCtx }) {
	const posLines = positionLines(ctx)
	const appLine = appearanceLine(ctx)
	const geoLine = geometryLine(ctx)
	const fLines = fillLines(ctx)
	const sLines = strokeLines(ctx)
	const tLines = textLines(ctx)
	return (
		<>
			{posLines.length > 0 && <AnatomySection id="position" title="Position">{posLines}</AnatomySection>}
			{appLine && <AnatomySection id="appearance" title="Appearance">{appLine}</AnatomySection>}
			{geoLine && <AnatomySection id="geometry" title="Geometry">{geoLine}</AnatomySection>}
			{fLines.length > 0 && <AnatomySection id="fill" title="Fill">{fLines}</AnatomySection>}
			{sLines.length > 0 && <AnatomySection id="stroke" title="Stroke">{sLines}</AnatomySection>}
			{tLines.length > 0 && <AnatomySection id="text" title="Text">{tLines}</AnatomySection>}
		</>
	)
}

/* -------------------------------------------------------------------- V5 -- */
/**
 * "Icon strips": every section collapses to ONE dense line of 24px icon
 * buttons and mini fields (Position gets two — see its own brief: a 4-up
 * XYWH line plus a second rotate/flip/lock/opacity line). Captions become
 * tooltips (every atom below already carries one via `Tooltip`/`title=`);
 * section TITLES stay, per the brief's own words.
 */
function V5Sections({ ctx }: { ctx: AnatomyCtx }) {
	const { controls } = ctx
	const x = controls.get('x')
	const y = controls.get('y')
	const w = controls.get('w')
	const h = controls.get('h')
	const rotation = controls.get('rotation')
	const flipX = controls.get('flipX')
	const flipY = controls.get('flipY')
	const isLocked = controls.get('isLocked')
	const opacity = controls.get('opacity')
	const cornerRadius = controls.get('cornerRadius')
	const geo = controls.get('geo')
	const fill = controls.get('fill')
	const color = controls.get('color')
	const fillColor = controls.get('fillColor')
	const fillOpacity = controls.get('fillOpacity')
	const dash = controls.get('dash')
	const strokeColor = controls.get('strokeColor')
	const strokeWidth = controls.get('strokeWidth')
	const size = controls.get('size')
	const font = controls.get('font')
	const labelFontSize = controls.get('labelFontSize')
	const labelFontWeight = controls.get('labelFontWeight')
	const textOutline = controls.get('textOutline')
	const align = controls.get('align')
	const verticalAlign = controls.get('verticalAlign')
	const labelColorProp = controls.get('labelColorProp')
	const labelColor = controls.get('labelColor')

	const positionLine1 = (x || y || w || h) ? (
		<Line key="p1" testId="inspector-line-xywh">
			{x && <NumberCell control={x} ctx={ctx} className="min-w-0 flex-1 basis-0" />}
			{y && <NumberCell control={y} ctx={ctx} className="min-w-0 flex-1 basis-0" />}
			{w && <NumberCell control={w} ctx={ctx} className="min-w-0 flex-1 basis-0" />}
			{h && <NumberCell control={h} ctx={ctx} className="min-w-0 flex-1 basis-0" />}
		</Line>
	) : null
	const positionLine2 = (rotation || flipX || flipY || isLocked || opacity) ? (
		<Line key="p2" testId="inspector-line-rotate-opacity">
			{rotation && <NumberCell control={rotation} ctx={ctx} className="min-w-0 flex-1 basis-0" />}
			{flipX && <ToggleIconButton control={flipX} ctx={ctx} icon={<FlipHorizontal2 className="size-3.5" />} label="Flip X" />}
			{flipY && <ToggleIconButton control={flipY} ctx={ctx} icon={<FlipVertical2 className="size-3.5" />} label="Flip Y" />}
			{isLocked && <ToggleIconButton control={isLocked} ctx={ctx} icon={isLocked.value ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />} label="Locked" />}
			{opacity && <NumberCell control={opacity} ctx={ctx} className="min-w-0 flex-1 basis-0" />}
		</Line>
	) : null

	const more = [controls.get('scale'), controls.get('growY'), controls.get('url')].filter((c): c is InspectorControl => Boolean(c))
	const geoLine = (geo || cornerRadius) ? (
		<Line key="ga" testId="inspector-line-geo-appearance">
			{geo && <GeometrySelect control={geo} ctx={ctx} className="w-20 shrink-0" />}
			{cornerRadius && <NumberCell control={cornerRadius} ctx={ctx} />}
			<MorePopover ctx={ctx} controls={more} testId="inspector-more-appearance" title="Scale, grown height, link" />
		</Line>
	) : null

	const fillReading = (color || fillColor) ? effectiveColorReading(ctx.editor, color, fillColor, fill?.value) : null
	const fillLine = fillReading ? (
		<Line key="fill" testId="inspector-line-fill">
			<ColorPickerPopover ctx={ctx} triggerTestId="inspector-fillswatch" label="Fill" swatch={fillReading.swatch} exactControl={fillColor} namedControl={color} styleControl={fill} />
			<span className="min-w-0 flex-1 truncate text-[11px] text-[var(--v-surface)]" data-testid="inspector-fill-name">{fillReading.text}</span>
			{fillOpacity ? (
				<div className="w-14 shrink-0">
					<ScrubNumber
						value={typeof fillOpacity.value === 'number' ? fillOpacity.value * 100 : null}
						unset={fillOpacity.unset} min={0} max={100} step={1} unit="%"
						fallback={(fillOpacity.fallback ?? 1) * 100}
						label="Fill alpha" testId="fillOpacityPercent"
						onChange={(percent) => ctx.onChange('fillOpacity', percent / 100)}
					/>
				</div>
			) : null}
			{fill ? <EyeToggle on={fill.value !== 'none'} testId="inspector-fill-eye" label="Fill visible" onToggle={() => ctx.onChange('fill', fill.value === 'none' ? ctx.lastFillStyleRef.current : 'none')} /> : null}
		</Line>
	) : null

	const strokeReading = (color || strokeColor) ? effectiveColorReading(ctx.editor, color, strokeColor, undefined) : null
	// Deviation, documented: V5's single stroke line follows the brief's own
	// literal element list — swatch/hex/alpha/eye/dash/weight — and drops
	// corner roundness (`strokeRoundness`), which the brief's V5 paragraph
	// never mentions. It stays reachable in V4/V6.
	const strokeLine = strokeReading ? (
		<Line key="stroke" testId="inspector-line-stroke">
			<ColorPickerPopover ctx={ctx} triggerTestId="inspector-strokeswatch" label="Stroke" swatch={strokeReading.swatch} exactControl={strokeColor} namedControl={color} />
			<span className="min-w-0 flex-1 truncate text-[11px] text-[var(--v-surface)]" data-testid="inspector-stroke-name">{strokeReading.text}</span>
			{strokeColor ? (
				<div className="w-14 shrink-0">
					<ScrubNumber
						value={typeof strokeColor.value === 'string' ? hexAlphaPercent(strokeColor.value) : null}
						unset={!strokeColor.value} min={0} max={100} step={1} unit="%" fallback={100}
						label="Stroke alpha" testId="strokeAlphaPercent"
						onChange={(percent) => ctx.onChange('strokeColor', withHexAlphaPercent(String(strokeColor.value || strokeReading.swatch || '#000000'), percent))}
					/>
				</div>
			) : null}
			{dash ? <EyeToggle on={dash.value !== 'none'} testId="inspector-stroke-eye" label="Outline visible" onToggle={() => ctx.onChange('dash', dash.value === 'none' ? ctx.lastDashStyleRef.current : 'none')} /> : null}
			{dash && <DashSelect control={dash} ctx={ctx} />}
			{(strokeWidth || size) && <WeightSelect sizeControl={size} exactControl={strokeWidth} ctx={ctx} width="w-14" />}
		</Line>
	) : null

	const textMore = [controls.get('labelLineHeight'), controls.get('labelPadding'), controls.get('labelEdgeMargin'), controls.get('labelMinWidth'), controls.get('labelFontFamily')]
		.filter((c): c is InspectorControl => Boolean(c))
	// V5's own condensation: the brief's literal element for this dense line
	// is "[B toggle]", not the full six-rung `labelFontWeight` segmented
	// control V4/V6 draw (`WeightWordSelect`) — a binary bold/regular reading
	// of the same StyleProp (>= 600 counts as bold), a real simplification
	// documented here and in docs/log.md, not a second field. The full ladder
	// stays reachable in V4/V6.
	const isBold = typeof labelFontWeight?.value === 'string' && Number(labelFontWeight.value) >= 600
	const boldButton = labelFontWeight ? (
		<button
			type="button"
			data-testid="inspector-boldtoggle"
			aria-pressed={isBold}
			aria-label="Bold"
			data-state={isBold ? 'on' : 'off'}
			className="flex size-6 shrink-0 items-center justify-center rounded border-0 bg-transparent text-[11px] font-bold text-[var(--v-surface)] outline-none data-[state=on]:bg-[var(--v-hover)]"
			onClick={() => ctx.onChange('labelFontWeight', isBold ? '400' : '700')}
		>
			B
		</button>
	) : null
	const textLine1 = font ? (
		<Line key="t1" testId="inspector-line-text-1">
			<div className="min-w-0 flex-1">
				<CompactSelect
					items={(font.options ?? []).map((option) => ({
						value: option.value,
						label: option.label,
						icon: TLDRAW_ICONS.font?.[option.value] ? <TldrawIcon id="font" value={option.value} className="size-4 shrink-0" /> : undefined,
					}))}
					value={typeof font.value === 'string' ? font.value : undefined}
					onChange={(value) => ctx.onChange('font', value)}
					testId="inspector-fontselect"
					ariaLabel="Font"
				/>
			</div>
			{labelFontSize && <NumberCell control={labelFontSize} ctx={ctx} className="w-14 shrink-0" />}
			{boldButton}
			{textOutline ? <HaloToggle control={textOutline} ctx={ctx} /> : null}
			<MorePopover ctx={ctx} controls={textMore} testId="inspector-more-text" title="Line height, padding, label fit, typeface" />
		</Line>
	) : null
	const labelReading = (labelColorProp || labelColor) ? effectiveColorReading(ctx.editor, labelColorProp, labelColor, undefined) : null
	const textLine2 = (align || verticalAlign || labelReading) ? (
		<Line key="t2" testId="inspector-line-text-2">
			{align ? <SegmentedIconRow control={align} ctx={ctx} /> : null}
			{verticalAlign ? <SegmentedIconRow control={verticalAlign} ctx={ctx} /> : null}
			{labelReading ? (
				<>
					<ColorPickerPopover ctx={ctx} triggerTestId="inspector-labelswatch" label="Label" swatch={labelReading.swatch} exactControl={labelColor} namedControl={labelColorProp} />
					<span className="w-14 shrink-0 truncate text-[11px] text-[var(--v-surface)]" data-testid="inspector-label-name">{labelReading.text}</span>
				</>
			) : null}
		</Line>
	) : null

	return (
		<>
			{(positionLine1 || positionLine2) && <AnatomySection id="position" title="Position">{[positionLine1, positionLine2].filter(Boolean)}</AnatomySection>}
			{geoLine && <AnatomySection id="appearance-geometry" title="Appearance · Geometry">{geoLine}</AnatomySection>}
			{fillLine && <AnatomySection id="fill" title="Fill">{fillLine}</AnatomySection>}
			{strokeLine && <AnatomySection id="stroke" title="Stroke">{strokeLine}</AnatomySection>}
			{(textLine1 || textLine2) && <AnatomySection id="text" title="Text">{[textLine1, textLine2].filter(Boolean)}</AnatomySection>}
		</>
	)
}

/* -------------------------------------------------------------------- V6 -- */

/** One value chip — "solid", "blue", "100%" — read straight from the SAME
 *  `InspectorControl` reading the expanded body draws from, never a second
 *  copy of the state (the brief's own proof requirement: a summary chip
 *  must change live when `editor.updateShapes` changes the value). */
function Chip({ children }: { children: React.ReactNode }) {
	if (children === undefined || children === null || children === '') return null
	return <span className="rounded-sm bg-[var(--v-field)] px-1 py-0.5 text-[10px] text-[var(--v-muted)]" data-testid="inspector-summary-chip">{children}</span>
}

function fillSummary(ctx: AnatomyCtx): React.ReactNode {
	const { controls } = ctx
	const fill = controls.get('fill')
	const color = controls.get('color')
	const fillColor = controls.get('fillColor')
	if (!color && !fillColor) return null
	const { text } = effectiveColorReading(ctx.editor, color, fillColor, fill?.value)
	const fillOpacity = controls.get('fillOpacity')
	const percent = typeof fillOpacity?.value === 'number' ? Math.round(fillOpacity.value * 100) : 100
	return <>{fill && <Chip>{fill.value === 'none' ? 'none' : String(fill.value)}</Chip>}<Chip>{text}</Chip><Chip>{percent}%</Chip></>
}

function strokeSummary(ctx: AnatomyCtx): React.ReactNode {
	const { controls } = ctx
	const dash = controls.get('dash')
	const color = controls.get('color')
	const strokeColor = controls.get('strokeColor')
	if (!color && !strokeColor) return null
	const { text } = effectiveColorReading(ctx.editor, color, strokeColor, undefined)
	const size = controls.get('size')
	return <>{dash && <Chip>{String(dash.value)}</Chip>}<Chip>{text}</Chip>{size && <Chip>{String(size.value).toUpperCase()}</Chip>}</>
}

function textSummary(ctx: AnatomyCtx): React.ReactNode {
	const { controls } = ctx
	const font = controls.get('font')
	const labelFontSize = controls.get('labelFontSize')
	const align = controls.get('align')
	if (!font) return null
	return <>{<Chip>{String(font.value)}</Chip>}{labelFontSize && typeof labelFontSize.value === 'number' && <Chip>{Math.round(labelFontSize.value)}px</Chip>}{align && <Chip>{String(align.value)}</Chip>}</>
}

function positionSummary(ctx: AnatomyCtx): React.ReactNode {
	const { controls } = ctx
	const x = controls.get('x')
	const y = controls.get('y')
	if (!x || !y) return null
	return <><Chip>x {Math.round(Number(x.value ?? 0))}</Chip><Chip>y {Math.round(Number(y.value ?? 0))}</Chip></>
}

function appearanceSummary(ctx: AnatomyCtx): React.ReactNode {
	const { controls } = ctx
	const opacity = controls.get('opacity')
	if (!opacity) return null
	return <Chip>{Math.round(Number(opacity.value ?? 100))}%</Chip>
}

function geometrySummary(ctx: AnatomyCtx): React.ReactNode {
	const geo = ctx.controls.get('geo')
	if (!geo) return null
	return <Chip>{String(geo.value)}</Chip>
}

/** V6's own disclosure — a real `Collapsible`, one open at a time by
 *  default (an accordion; `Inspector.tsx`'s existing `Section` in
 *  round 1 opens every group at once, which is exactly the "not compact"
 *  verdict this round answers). The summary line — title + chips — IS the
 *  closed state's one line; it stays mounted (not swapped out) while open,
 *  same convention `SectionHeaderRow` already uses for the chevron. */
function AccordionSection({
	id,
	title,
	summary,
	open,
	onToggle,
	children,
}: {
	id: string
	title: string
	summary: React.ReactNode
	open: boolean
	onToggle(): void
	children: React.ReactNode
}) {
	if (!summary && !children) return null
	return (
		<Collapsible open={open} onOpenChange={onToggle} className="border-b border-[var(--v-border)]" data-section={id}>
			<CollapsibleTrigger
				render={
					<button
						type="button"
						data-testid={`inspector-accordion-${id}`}
						className="group flex w-full items-center gap-1.5 px-3 py-2 text-left"
					/>
				}
			>
				<ChevronRight aria-hidden="true" className="size-3 shrink-0 text-[var(--v-muted)] transition-transform duration-150 group-data-[panel-open]:rotate-90" />
				<span className={cn(sectionTitleClass, 'shrink-0')}>{title}</span>
				<span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1" data-line="" data-testid={`inspector-summary-${id}`}>{summary}</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="flex flex-col gap-1.5 px-3 pb-3">{children}</CollapsibleContent>
		</Collapsible>
	)
}

const V6_SECTION_IDS = ['position', 'appearance', 'geometry', 'fill', 'stroke', 'text'] as const

function V6Sections({ ctx }: { ctx: AnatomyCtx }) {
	// Every section starts CLOSED — the brief's own target ("6 lines closed")
	// is measured against a fresh load, so the default has to be nothing open,
	// not one section pre-expanded. "One section open at a time" governs the
	// INTERACTION once a header IS clicked (an accordion: opening one closes
	// any other), which `setOpenId`'s toggle below already gives for free.
	// `openAll` is the brief's own escape hatch: "all-open available via a
	// header toggle."
	const [openId, setOpenId] = useState<string | null>(null)
	const [openAll, setOpenAll] = useState(false)

	const bodies: Record<string, React.ReactNode> = {
		position: positionLines(ctx),
		appearance: appearanceLine(ctx),
		geometry: geometryLine(ctx),
		fill: fillLines(ctx),
		stroke: strokeLines(ctx),
		text: textLines(ctx),
	}
	const summaries: Record<string, React.ReactNode> = {
		position: positionSummary(ctx),
		appearance: appearanceSummary(ctx),
		geometry: geometrySummary(ctx),
		fill: fillSummary(ctx),
		stroke: strokeSummary(ctx),
		text: textSummary(ctx),
	}
	const titles: Record<string, string> = { position: 'Position', appearance: 'Appearance', geometry: 'Geometry', fill: 'Fill', stroke: 'Stroke', text: 'Text' }

	return (
		<>
			<div className="flex items-center justify-end px-3 py-1.5">
				<Button size="xs" variant="ghost" data-testid="inspector-accordion-openall" onClick={() => setOpenAll((v) => !v)}>
					{openAll ? 'Collapse all' : 'Expand all'}
				</Button>
			</div>
			{V6_SECTION_IDS.map((id) => (
				<AccordionSection
					key={id}
					id={id}
					title={titles[id]}
					summary={summaries[id]}
					open={openAll || openId === id}
					onToggle={() => setOpenId((current) => (current === id ? null : id))}
				>
					{bodies[id]}
				</AccordionSection>
			))}
		</>
	)
}

/* --------------------------------------------------------------- header --- */

function PanelHeader({ model, onReset, onUnlock }: { model: PrimitiveInspectorModel; onReset(): void; onUnlock(): void }) {
	return (
		<header className="flex items-center justify-between gap-2 border-b border-[var(--v-border)] px-3 py-2.5">
			<div className="min-w-0">
				<h2 className="truncate text-sm font-semibold text-[var(--v-surface)]">{model.title}</h2>
				<p className="truncate text-xs text-[var(--v-muted)]">{model.types.join(' · ')}</p>
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{model.hasOverrides ? <Button size="xs" variant="ghost" data-testid="inspector-reset" onClick={onReset}>Reset</Button> : null}
				{model.locked ? <Button size="xs" variant="ghost" data-testid="inspector-unlock" onClick={onUnlock}>Unlock</Button> : null}
			</div>
		</header>
	)
}

/* ----------------------------------------------------------------- export - */

export function FigmaAnatomyView({
	variant,
	model,
	editor,
	onChange,
	onClear,
	onReset,
	onUnlock,
}: {
	variant: Extract<VariantId, 4 | 5 | 6>
	model: PrimitiveInspectorModel | null
	editor: Editor
	onChange(id: string, value: InspectorValue, gestureStart: boolean): void
	onClear(id: string): void
	onReset(): void
	onUnlock(): void
}) {
	return (
		<div data-testid="inspector-panel" className="flex h-full flex-col">
			{model ? <PanelHeader model={model} onReset={onReset} onUnlock={onUnlock} /> : null}
			<ScrollArea className="min-h-0 flex-1">
				{model ? (
					<FigmaAnatomyBody variant={variant} model={model} editor={editor} onChange={onChange} onClear={onClear} />
				) : (
					<Field className="p-4">
						<FieldDescription>Select something to inspect it.</FieldDescription>
					</Field>
				)}
			</ScrollArea>
		</div>
	)
}

function FigmaAnatomyBody({
	variant,
	model,
	editor,
	onChange,
	onClear,
}: {
	variant: Extract<VariantId, 4 | 5 | 6>
	model: PrimitiveInspectorModel
	editor: Editor
	onChange(id: string, value: InspectorValue, gestureStart: boolean): void
	onClear(id: string): void
}) {
	const ctx = useAnatomyCtx(model, editor, onChange, onClear)
	if (variant === 5) return <div className="flex flex-col"><V5Sections ctx={ctx} /></div>
	if (variant === 6) return <div className="flex flex-col"><V6Sections ctx={ctx} /></div>
	return <div className="flex flex-col"><V4Sections ctx={ctx} /></div>
}

// `controlsById` is re-exported for the gallery builder, which reads the raw
// model to print the measured line-count table beside the Figma numbers
// without duplicating the id lookup.
export { controlsById }
