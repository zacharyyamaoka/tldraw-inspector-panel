/**
 * Figma's numeric field: a box you can type in and drag on.
 *
 * Ported LOGIC-verbatim from SystemSketch (77907974,
 * src/inspector/ScrubNumber.tsx) — the expression parser, `quantize`, the
 * `auto`-from-engine-value scrub origin, and the one-gesture-one-undo-step
 * `ENGINE_REASONS` gate are all unchanged. Only the skin moved: the donor's
 * own `.systemsketch-inspector__field` / `__scrub` / `__unit` CSS classes are
 * replaced with Tailwind classes and shadcn's `InputGroup` (this lab's stack
 * has no `primitive-inspector.css` to inherit). `data-testid`s are unchanged
 * so the ported journey (`tests/inspector_smoke.mjs`) finds the same rows.
 *
 * The interaction Zach asked for by name — "the text boxes also act as
 * sliders". Three affordances in one 280px-friendly control, which is why the
 * panel has no sliders left at all: a track plus a value box costs twice the
 * width and reads worse. The glyph is the drag handle, never the text — Figma's
 * split, and the single detail that stops a scrub from eating a click meant to
 * place a caret.
 *
 * WHY this is Base UI's `NumberField` and not hand-rolled: `@base-ui/react`
 * (MIT) is headless — no stylesheet, no font stack, nothing to fight this
 * lab's token bridge with — and it already has the parts a hand-rolled version
 * gets subtly wrong: `value: number | null` as a real mixed/unset state,
 * `smallStep`/`largeStep` read live on both keyboard and scrub (alt/shift
 * change granularity mid-drag), `onValueCommitted` (fires on pointer-up after
 * a scrub and on blur after typing — the exact seam for "one gesture is one
 * undo step"), and Pointer Lock with a `teleportDistance` wrap released on
 * every cancel path.
 *
 * What stays this app's own: the expression parser
 * ({@link evaluateNumericExpression} — `100/2`, a relative `+6`) and the
 * notion of an override that is not set yet. Base UI exposes no `parse` hook
 * and does not export its root context, so the parser cannot be installed
 * inside it — the seam that does work, and is a supported one rather than a
 * hack, is that `NumberFieldInput`'s own `onChange`/`onBlur` bail on
 * `defaultPrevented` and treat Enter as a navigation key. A local draft plus
 * `preventDefault()` on Enter hands the raw text to the parser while Base UI
 * keeps every gesture it owns.
 */
import { NumberField } from '@base-ui/react/number-field'
import { useRef, useState } from 'react'

import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import { cn } from 'cn'

import { FIELD_GLYPHS } from './glyphs'

export interface ScrubNumberProps {
	value: number | null
	/** True when no shape has an opinion yet: the field shows what tldraw is
	 *  painting, greyed, and writing anything makes it an override. */
	unset?: boolean
	min?: number
	max?: number
	step?: number
	unit?: string
	/** Names a path in `FIELD_GLYPHS`. It is the drag handle. */
	glyph?: string
	/** tldraw's own value, shown while the row is still `unset`. */
	fallback?: number
	label: string
	testId: string
	title?: string
	/** tldraw derives the value shown; the field is display-only. Still
	 *  rendered (never dropped) so its number stays visible and comparable
	 *  with every other row — `growY` is the first field to need this. */
	disabled?: boolean
	/** `gestureStart` is false for every frame of a drag after the first, so one
	 *  scrub is one undo step. */
	onChange(value: number, gestureStart: boolean): void
}

/**
 * Longer than any real entry, and short enough that the recursive-descent
 * parser below cannot reach the engine's stack limit. Pasting 12 KB of `(`
 * into a number field threw an uncaught RangeError before this.
 */
const MAX_EXPRESSION_LENGTH = 200

/**
 * A tiny arithmetic evaluator: digits, `+ - * / ( )`, decimals and `%`.
 *
 * WHY not `eval` or `new Function`: this reads a text field, and a field that
 * executes what is typed into it is a script-injection surface — a board is a
 * document other people can send you. The grammar below is the whole language.
 *
 * WHY it is ours at all: no numeric-input library evaluates an expression, and
 * typing `100/2` into a size box is most of why anyone uses these fields.
 */
export function evaluateNumericExpression(input: string, base?: number | null): number | null {
	// WHY the comma is not stripped: `1,5` is a decimal comma in most of the
	// world, and treating it as a thousands separator silently returned 15.
	// A field that multiplies your input by ten is worse than one that refuses.
	let text = input.trim().replace(/%$/, '')
	if (text === '' || text.length > MAX_EXPRESSION_LENGTH) return null
	// A leading operator is relative to what the field already holds — Figma's
	// `+6` / `/2`. `-` is excluded: a typed `-8` is far more often a negative
	// number than a subtraction from the current one.
	if (/^[*/+]/.test(text)) {
		if (base === undefined || base === null) return null
		text = `${base}${text}`
	}
	if (!/^[-+*/().\d\s]+$/.test(text)) return null
	const tokens = text.match(/\d*\.?\d+|[-+*/()]/g)
	if (!tokens) return null

	let position = 0
	const peek = () => tokens[position]
	const expression = (): number | null => {
		let left = term()
		if (left === null) return null
		while (peek() === '+' || peek() === '-') {
			const operator = tokens[position++]
			const right = term()
			if (right === null) return null
			left = operator === '+' ? left + right : left - right
		}
		return left
	}
	const term = (): number | null => {
		let left = unary()
		if (left === null) return null
		while (peek() === '*' || peek() === '/') {
			const operator = tokens[position++]
			const right = unary()
			if (right === null) return null
			if (operator === '/' && right === 0) return null
			left = operator === '*' ? left * right : left / right
		}
		return left
	}
	const unary = (): number | null => {
		if (peek() === '-') { position += 1; const value = unary(); return value === null ? null : -value }
		if (peek() === '+') { position += 1; return unary() }
		if (peek() === '(') {
			position += 1
			const value = expression()
			if (peek() !== ')') return null
			position += 1
			return value
		}
		const token = tokens[position]
		if (token === undefined || !/^\d*\.?\d+$/.test(token)) return null
		position += 1
		return Number(token)
	}
	const result = expression()
	if (result === null || position !== tokens.length || !Number.isFinite(result)) return null
	return result
}

/** Round away the float dust a multiplied step leaves behind. */
export function quantize(value: number, step: number): number {
	const places = Math.max(0, Math.ceil(-Math.log10(step === 0 ? 1 : Math.abs(step))) + 1)
	return Number(value.toFixed(Math.min(6, places)))
}

/** The gestures Base UI owns end to end; typing is committed by our parser. */
const ENGINE_REASONS = new Set(['scrub', 'keyboard', 'wheel', 'increment-press', 'decrement-press'])

export function ScrubNumber({
	value,
	unset,
	min,
	max,
	step = 1,
	unit,
	glyph,
	fallback,
	label,
	testId,
	title,
	disabled,
	onChange,
}: ScrubNumberProps) {
	// A scrub emits a value every couple of pixels of travel. The first marks
	// history and the rest do not, so one drag is one Ctrl+Z.
	const scrubbing = useRef(false)
	const [draft, setDraft] = useState<string | null>(null)

	/**
	 * What the field shows while nothing has been set: tldraw's own number.
	 *
	 * WHY not a blank `auto`, which is what this did first — the engine IS
	 * painting a value, so showing it is both more useful and what makes a scrub
	 * start from the right place instead of slamming to the field's minimum. The
	 * accent provenance dot and the row's × are what say it is an override; the
	 * greyed `data-unset` styling is what says it is not one yet.
	 */
	const shown = value ?? (unset ? fallback ?? min ?? 0 : null)

	const commitTyped = (raw: string) => {
		if (draft === null) return
		setDraft(null)
		const parsed = evaluateNumericExpression(raw, shown)
		if (parsed === null) return
		let bounded = quantize(parsed, step)
		if (min !== undefined) bounded = Math.max(min, bounded)
		if (max !== undefined) bounded = Math.min(max, bounded)
		onChange(bounded, true)
	}

	return (
		<NumberField.Root
			value={shown}
			min={min}
			max={max}
			step={step}
			disabled={disabled}
			// Figma's multipliers. Base UI applies them to the scrub as well as to
			// the arrow keys, and reads them live, so shift mid-drag goes coarse.
			largeStep={step * 10}
			smallStep={step / 10}
			data-testid={`inspector-field-${testId}`}
			data-unset={unset ? 'true' : undefined}
			title={title}
			onValueChange={(next, details) => {
				if (next === null || !ENGINE_REASONS.has(details.reason)) return
				const gestureStart = details.reason !== 'scrub' || !scrubbing.current
				if (details.reason === 'scrub') scrubbing.current = true
				onChange(quantize(next, step), gestureStart)
			}}
			onValueCommitted={() => { scrubbing.current = false }}
			render={
				<InputGroup
					className={cn('h-7', (unset || disabled) && 'opacity-60')}
					data-unset={unset ? 'true' : undefined}
				/>
			}
		>
			{glyph ? (
				<InputGroupAddon>
					<NumberField.ScrubArea
						className="flex size-4 cursor-ew-resize items-center justify-center text-muted-foreground"
						// Excalidraw calls the same constant `sensitivity`. 2px is Base
						// UI's default and the value the hand-rolled predecessor settled on.
						pixelSensitivity={2}
						aria-label={`${label} scrubber`}
						data-testid={`inspector-scrub-${testId}`}
					>
						<svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 stroke-current fill-none stroke-[1.4]">
							<path d={FIELD_GLYPHS[glyph] ?? FIELD_GLYPHS.position} />
						</svg>
					</NumberField.ScrubArea>
				</InputGroupAddon>
			) : null}
			<NumberField.Input
				aria-label={label}
				data-testid={`inspector-number-${testId}`}
				// WHY `min-w-0` is load-bearing, not decorative: a native `<input>`
				// has an intrinsic default width and a flex item's `min-width`
				// defaults to `auto`, not `0` — so without this the input refused
				// to shrink below ~193px inside a narrow paired cell. Its overflow
				// painted past the InputGroup's own border, invisibly (no
				// distinguishing background), and sat on top of — so silently ate
				// clicks meant for — the "×" clear button drawn immediately after
				// it. shadcn's own `Input` sets this on every field for the same
				// reason; this one is hand-styled (see the file header) so it needs
				// its own copy.
				className="h-7 min-w-0 flex-1 rounded-none border-0 bg-transparent px-1.5 text-sm outline-none"
				{...(draft === null ? {} : { value: draft })}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={(event) => commitTyped(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key === 'Escape') { setDraft(null); return }
					if (event.key !== 'Enter' || draft === null) return
					// Our parser first: `100/2` is not a number to Base UI.
					event.preventDefault()
					commitTyped((event.currentTarget as HTMLInputElement).value)
				}}
			/>
			{unit ? <InputGroupAddon align="inline-end">{unit}</InputGroupAddon> : null}
		</NumberField.Root>
	)
}
