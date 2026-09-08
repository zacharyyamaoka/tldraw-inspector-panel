import { useSyncExternalStore } from 'react'
import { PercentInput } from './PercentInput'
import { DefaultHelperButtons } from 'tldraw'
import {
	MAX_SPEED_PERCENT,
	MIN_SPEED_PERCENT,
	clampSpeedPercent,
	getGestureSettings,
	setGestureSettings,
	subscribeToGestureSettings,
} from './gestureSettings'
import { isTuningOpen, setTuningOpen, subscribeToTuning } from './tuningStore'

/**
 * The live-tuning HUD: sensitivity only, and it never eats a canvas event.
 *
 * WHY `pointer-events: none` on the wrapper with `auto` only on the card: the
 * panel floats OVER the board, and the whole reason it exists is that you can
 * keep scrolling and zooming underneath it while you drag a slider. A wrapper
 * that swallowed pointer events would recreate the modal problem in a smaller
 * rectangle.
 *
 * To be precise, since an earlier version of this comment overclaimed: the CARD
 * itself does take the gestures that start on it — it has to, or its sliders
 * would not work. What is guaranteed is that the rest of the panel's rectangle
 * is transparent to the canvas, and that the card is small and parked in the
 * one corner nothing else needs.
 *
 * Bottom-left on purpose: the inspector owns the right edge, the toolbar owns
 * the bottom centre, and the menu owns the top-left — this is the one corner
 * where a persistent panel does not cover something you need while tuning.
 */
/**
 * Mounted as `components.HelperButtons`, so it must RENDER tldraw's own first.
 *
 * WHY: that slot is not empty. It carries "Back to content", "Exit pen mode"
 * and "Stop following" — the controls that rescue someone who has panned the
 * board off-screen. Replacing the slot silently deleted all three, which is a
 * worse bug than the one this panel fixes.
 */
export function HelperButtonsWithTuning() {
	return (
		<>
			<DefaultHelperButtons />
			<TuningPanel />
		</>
	)
}

export function TuningPanel() {
	const open = useSyncExternalStore(subscribeToTuning, isTuningOpen, isTuningOpen)
	const settings = useSyncExternalStore(subscribeToGestureSettings, getGestureSettings, getGestureSettings)
	if (!open) return null

	return (
		<div
			data-testid="tuning-panel"
			style={{
				position: 'fixed',
				left: 8,
				// Clears tldraw's own navigation panel (the zoom readout and minimap
				// toggle) which occupies the bottom-left corner — the first version
				// sat on top of it at bottom:8 and covered the zoom percentage, which
				// is precisely the number you watch while tuning zoom speed.
				bottom: 56,
				zIndex: 300,
				pointerEvents: 'none',
				display: 'flex',
			}}
		>
			<div
				style={{
					pointerEvents: 'auto',
					background: 'var(--tl-color-panel)',
					border: '1px solid var(--tl-color-low-border)',
					borderRadius: 'var(--tl-radius-3)',
					boxShadow: 'var(--tl-shadow-2)',
					padding: '10px 12px',
					display: 'flex',
					flexDirection: 'column',
					gap: 8,
					minWidth: 236,
					color: 'var(--tl-color-text-1)',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
					<span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--tl-color-text-3)' }}>
						Live tuning
					</span>
					<button
						type="button"
						data-testid="tuning-close"
						onClick={() => setTuningOpen(false)}
						aria-label="Close live tuning"
						style={{
							appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer',
							color: 'var(--tl-color-text-3)', fontSize: 14, lineHeight: 1, padding: 2,
						}}
					>
						✕
					</button>
				</div>
				<Slider
					label="Scroll"
					testId="tuning-pan-speed"
					value={settings.panSpeedPercent}
					onChange={(panSpeedPercent) => setGestureSettings({ ...settings, panSpeedPercent })}
				/>
				<Slider
					label="Zoom"
					testId="tuning-zoom-speed"
					value={settings.zoomSpeedPercent}
					onChange={(zoomSpeedPercent) => setGestureSettings({ ...settings, zoomSpeedPercent })}
				/>
				<span style={{ fontSize: 11, color: 'var(--tl-color-text-3)' }}>
					Scroll and ctrl+scroll the board while you drag.
				</span>
			</div>
		</div>
	)
}

function Slider({ label, value, onChange, testId }: {
	label: string
	value: number
	onChange(percent: number): void
	testId: string
}) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
			<span style={{ fontSize: 12, width: 44 }}>{label}</span>
			<input
				type="range"
				aria-label={`${label} sensitivity`}
				min={MIN_SPEED_PERCENT}
				max={MAX_SPEED_PERCENT}
				step={5}
				value={value}
				onChange={(event) => onChange(clampSpeedPercent(Number(event.target.value)))}
				style={{ accentColor: 'var(--tl-color-selected)', flex: '1 1 auto', minWidth: 0 }}
			/>
			<PercentInput testId={testId} value={value} onCommit={onChange} style={{
					width: 52, height: 24, textAlign: 'right', fontSize: 12,
					borderRadius: 'var(--tl-radius-2)', border: '1px solid var(--tl-color-low-border)',
					background: 'var(--tl-color-panel)', color: 'var(--tl-color-text-1)', padding: '0 5px', outline: 'none',
				}} />
		</div>
	)
}
