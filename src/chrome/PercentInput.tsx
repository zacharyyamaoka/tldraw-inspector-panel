import { useEffect, useRef, useState } from 'react'
import { clampSpeedPercent, MAX_SPEED_PERCENT, MIN_SPEED_PERCENT } from './gestureSettings'

/**
 * A percent field you can actually TYPE a number into.
 *
 * WHY a draft string instead of clamping `onChange`: clamping every keystroke
 * makes the field fight the person using it. Starting at 50 and typing "25",
 * the "2" was immediately clamped up to the 5% minimum, so the next keystroke
 * produced 55 — measured, shown 55, stored 55. The user asked for exactly 25
 * and the control silently saved more than double. That is worse than not
 * offering exact entry at all, and it defeated the whole point of the field
 * Zach asked for ("so that I can set the scroll and zoom sensitivity exactly
 * to a value that I want").
 *
 * So the draft is whatever they have typed, uncommitted, and the clamp happens
 * once at commit — blur or Enter. Escape abandons. An empty or nonsense draft
 * reverts to the live value rather than writing a guess.
 */
export function PercentInput({ value, onCommit, testId, style }: {
	value: number
	onCommit(percent: number): void
	testId: string
	style?: React.CSSProperties
}) {
	const [draft, setDraft] = useState<string | null>(null)
	const ref = useRef<HTMLInputElement | null>(null)

	// Follow the store while NOT editing — a slider drag has to move the number,
	// but must not yank a half-typed value out from under the keyboard.
	useEffect(() => { if (draft === null && ref.current) ref.current.value = String(value) }, [value, draft])

	const commit = () => {
		const raw = draft
		setDraft(null)
		if (raw === null) return
		const parsed = Number(raw.trim())
		if (!Number.isFinite(parsed) || raw.trim() === '') {
			if (ref.current) ref.current.value = String(value)
			return
		}
		const next = clampSpeedPercent(parsed)
		if (ref.current) ref.current.value = String(next)
		onCommit(next)
	}

	return (
		<input
			ref={ref}
			type="text"
			inputMode="numeric"
			data-testid={testId}
			aria-label="Sensitivity percent"
			defaultValue={String(value)}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				// tldraw listens for keys globally; a digit or a "v" would otherwise
				// also reach the canvas and switch tools mid-entry.
				event.stopPropagation()
				if (event.key === 'Enter') { event.preventDefault(); commit(); ref.current?.blur() }
				if (event.key === 'Escape') {
					event.preventDefault()
					setDraft(null)
					if (ref.current) ref.current.value = String(value)
					ref.current?.blur()
				}
			}}
			title={`${MIN_SPEED_PERCENT}–${MAX_SPEED_PERCENT}%`}
			style={style}
		/>
	)
}
