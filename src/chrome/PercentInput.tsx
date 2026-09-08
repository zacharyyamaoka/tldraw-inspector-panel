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
	// The draft lives in a REF as well as state, and `commit` reads the ref.
	//
	// WHY: `onKeyDown` for Escape used to clear the draft with `setDraft(null)`
	// and then call `blur()`. State updates are not synchronous, so the ensuing
	// `onBlur` still closed over the PRE-CLEAR draft and committed it — Escape
	// saved the value it was supposed to abandon. Enter had the same shape,
	// committing once directly and again via blur. A ref updates immediately, so
	// there is exactly one commit path and Escape genuinely cancels.
	const draftRef = useRef<string | null>(null)
	const [isEditing, setIsEditing] = useState(false)
	const ref = useRef<HTMLInputElement | null>(null)

	const setDraft = (next: string | null) => {
		draftRef.current = next
		setIsEditing(next !== null)
	}

	// Follow the store while NOT editing — a slider drag has to move the number,
	// but must not yank a half-typed value out from under the keyboard.
	useEffect(() => { if (!isEditing && ref.current) ref.current.value = String(value) }, [value, isEditing])

	const commit = () => {
		const raw = draftRef.current
		setDraft(null)
		// Nothing uncommitted — an Escape already cleared it, or this is the blur
		// that follows an Enter which already committed.
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
					// Clear the ref FIRST: the blur below runs `commit`, which must
					// find nothing to save.
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
