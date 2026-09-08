/**
 * Wheel bindings and the paste-under-cursor toggle, as one persisted object.
 *
 * WHY these live here rather than in tldraw's own user preferences: tldraw has
 * a real preference store, but it is a fixed schema — there is no seam for an
 * app to add a key. Keeping ours separate means we never write into a stock
 * record or a stock preference blob, which is the same rule the inspector
 * follows for shapes (src/inspector/overrides.ts): stock things stay stock,
 * everything of ours rides alongside.
 */

/** What a wheel gesture can be bound to. Deliberately small — every entry has
 *  to be implementable with tldraw's own public editor API, no engine forks. */
export type WheelCommand =
	| 'none'
	| 'zoom-in'
	| 'zoom-out'
	| 'pan-up'
	| 'pan-down'
	| 'pan-left'
	| 'pan-right'
	| 'next-page'
	| 'prev-page'
	| 'undo'
	| 'redo'

export const WHEEL_COMMAND_LABELS: Record<WheelCommand, string> = {
	'none': 'Nothing',
	'zoom-in': 'Zoom in',
	'zoom-out': 'Zoom out',
	'pan-up': 'Pan up',
	'pan-down': 'Pan down',
	'pan-left': 'Pan left',
	'pan-right': 'Pan right',
	'next-page': 'Next page',
	'prev-page': 'Previous page',
	'undo': 'Undo',
	'redo': 'Redo',
}

/** The four wheel gestures the menu can rebind. */
export type WheelGesture = 'wheelDown' | 'wheelUp' | 'ctrlWheelDown' | 'ctrlWheelUp'

export const WHEEL_GESTURE_LABELS: Record<WheelGesture, string> = {
	wheelDown: 'Scroll wheel down',
	wheelUp: 'Scroll wheel up',
	ctrlWheelDown: 'Ctrl + scroll wheel down',
	ctrlWheelUp: 'Ctrl + scroll wheel up',
}

export interface GestureSettings {
	/** Paste (and duplicate) at the pointer rather than at the viewport centre. */
	pasteUnderCursor: boolean
	bindings: Record<WheelGesture, WheelCommand>
	/**
	 * Pan and zoom speed as a PERCENTAGE of tldraw's own, applied through
	 * `editor.setCameraOptions({ panSpeed, zoomSpeed })`.
	 *
	 * WHY a percentage of the stock value rather than a raw multiplier, and why
	 * it goes through tldraw's own camera options instead of our wheel handler:
	 * SystemSketch settled both questions already (`src/canvasCamera.ts`,
	 * `settings/appearancePreferences.ts`) — product language keeps 100 the
	 * obvious reset point, and the camera options seam means tldraw keeps
	 * owning momentum, trackpad detection and inertia, which a hand-rolled
	 * wheel multiplier would quietly replace with something worse.
	 */
	panSpeedPercent: number
	zoomSpeedPercent: number
}

export const SPEED_PERCENT_OPTIONS = [25, 50, 75, 100, 150, 200] as const

/**
 * WHY these particular defaults: they are what tldraw ALREADY does, so a fresh
 * load behaves exactly like stock and the feature only ever shows up when
 * someone opts into a change. Plain wheel scrolls the canvas vertically,
 * ctrl+wheel zooms — the convention every drawing tool shares. `pasteUnderCursor`
 * is ON because Zach asked for it on by default.
 */
export const DEFAULT_GESTURE_SETTINGS: GestureSettings = {
	pasteUnderCursor: true,
	bindings: {
		wheelDown: 'pan-down',
		wheelUp: 'pan-up',
		ctrlWheelDown: 'zoom-out',
		ctrlWheelUp: 'zoom-in',
	},
	// 50%, not 100%: Zach on the running app — "please add an option to adjust
	// the scroll sensitivity as well. right now its way to high". tldraw's stock
	// speed is tuned for a trackpad; on a wheel mouse each notch throws the
	// board. The control exists so this is a starting point rather than a guess
	// imposed on everyone, and 100 is one click away.
	panSpeedPercent: 50,
	zoomSpeedPercent: 50,
}

const STORAGE_KEY = 'tldraw-lab.gestures.v1'

function isCommand(value: unknown): value is WheelCommand {
	return typeof value === 'string' && value in WHEEL_COMMAND_LABELS
}

/**
 * Read persisted settings, repairing anything unrecognised back to the default.
 *
 * WHY per-field repair rather than "parse or discard": a binding added in a
 * later version, or one hand-edited to nonsense, should cost the user that one
 * binding — not silently reset the other three and the toggle with it.
 */
export function loadGestureSettings(): GestureSettings {
	if (typeof localStorage === 'undefined') return DEFAULT_GESTURE_SETTINGS
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return DEFAULT_GESTURE_SETTINGS
		const parsed = JSON.parse(raw) as Partial<GestureSettings>
		const bindings = { ...DEFAULT_GESTURE_SETTINGS.bindings }
		for (const gesture of Object.keys(bindings) as WheelGesture[]) {
			const candidate = parsed.bindings?.[gesture]
			if (isCommand(candidate)) bindings[gesture] = candidate
		}
		const percent = (value: unknown, fallback: number) =>
			typeof value === 'number' && Number.isFinite(value) && value >= 10 && value <= 400
				? value
				: fallback
		return {
			pasteUnderCursor: typeof parsed.pasteUnderCursor === 'boolean'
				? parsed.pasteUnderCursor
				: DEFAULT_GESTURE_SETTINGS.pasteUnderCursor,
			bindings,
			panSpeedPercent: percent(parsed.panSpeedPercent, DEFAULT_GESTURE_SETTINGS.panSpeedPercent),
			zoomSpeedPercent: percent(parsed.zoomSpeedPercent, DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent),
		}
	} catch {
		// A corrupt blob must never take the app down with it.
		return DEFAULT_GESTURE_SETTINGS
	}
}

const listeners = new Set<(settings: GestureSettings) => void>()
let current: GestureSettings | null = null

export function getGestureSettings(): GestureSettings {
	if (!current) current = loadGestureSettings()
	return current
}

export function setGestureSettings(next: GestureSettings): void {
	current = next
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
	} catch {
		// Private mode, quota, a blocked origin — none of which should stop the
		// setting working for THIS session.
	}
	for (const listener of listeners) listener(next)
}

export function subscribeToGestureSettings(listener: (settings: GestureSettings) => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}
