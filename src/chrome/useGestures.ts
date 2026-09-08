import { useEffect } from 'react'
import type { Editor } from 'tldraw'
import {
	getGestureSettings,
	subscribeToGestureSettings,
	type GestureSettings,
	type WheelCommand,
} from './gestureSettings'

/** How far one wheel notch pans, in screen px. Matches tldraw's own feel. */
const PAN_STEP = 100
function panBy(editor: Editor, dx: number, dy: number): boolean {
	const camera = editor.getCamera()
	editor.setCamera({ x: camera.x + dx / camera.z, y: camera.y + dy / camera.z, z: camera.z })
	return true
}

function runCommand(editor: Editor, command: WheelCommand): boolean {
	switch (command) {
		case 'none': return true
		// The editor has no `pan()`; moving the camera IS the pan. The screen
		// step is divided by zoom so a notch covers the same visible distance at
		// every zoom level, which is what makes it feel like scrolling rather
		// than like moving a map.
		case 'pan-up': return panBy(editor, 0, PAN_STEP)
		case 'pan-down': return panBy(editor, 0, -PAN_STEP)
		case 'pan-left': return panBy(editor, PAN_STEP, 0)
		case 'pan-right': return panBy(editor, -PAN_STEP, 0)
		// Zoom at the POINTER, not the viewport centre: a wheel gesture is
		// aimed at whatever is under the cursor.
		case 'zoom-in': editor.zoomIn(editor.inputs.getCurrentScreenPoint(), { animation: { duration: 0 } }); return true
		case 'zoom-out': editor.zoomOut(editor.inputs.getCurrentScreenPoint(), { animation: { duration: 0 } }); return true
		case 'undo': editor.undo(); return true
		case 'redo': editor.redo(); return true
		case 'next-page':
		case 'prev-page': {
			const pages = editor.getPages()
			if (pages.length < 2) return true
			const index = pages.findIndex((page) => page.id === editor.getCurrentPageId())
			const step = command === 'next-page' ? 1 : -1
			// Wrap, so a wheel bound to this never dead-ends at either edge.
			const next = pages[(index + step + pages.length) % pages.length]
			editor.setCurrentPage(next.id)
			return true
		}
		default: return false
	}
}

/**
 * Wheel bindings and paste-under-cursor, applied to a live editor.
 *
 * WHY a capture-phase listener on the container rather than tldraw's own
 * `onWheel`: the engine consumes wheel events internally to pan and zoom, so a
 * bubble-phase handler arrives after the canvas has already moved and would
 * fight it. Capture lets us decide FIRST, and `preventDefault` + `stopPropagation`
 * is what stops the stock behaviour running as well as ours. When a gesture is
 * left on its stock default we deliberately do NOT intercept at all — no
 * listener work, no risk of drift from tldraw's own momentum and trackpad
 * handling, which is far better than anything reimplemented here.
 */
export function useGestures(editor: Editor | null): void {
	useEffect(() => {
		if (!editor) return
		let settings: GestureSettings = getGestureSettings()
		const unsubscribe = subscribeToGestureSettings((next) => { settings = next })

		const container = editor.getContainer()
		const onWheel = (event: WheelEvent) => {
			// A wheel over a panel, a menu or any scrollable chrome is that
			// element's business — only the canvas takes these bindings.
			const target = event.target
			if (target instanceof HTMLElement && !target.closest('.tl-canvas')) return

			const withCtrl = event.ctrlKey || event.metaKey
			const down = event.deltaY > 0
			const gesture = withCtrl
				? (down ? 'ctrlWheelDown' : 'ctrlWheelUp')
				: (down ? 'wheelDown' : 'wheelUp')
			const command = settings.bindings[gesture]

			// Stock default for this gesture: let tldraw do its own, better thing.
			const isStockDefault = (gesture === 'wheelDown' && command === 'pan-down')
				|| (gesture === 'wheelUp' && command === 'pan-up')
				|| (gesture === 'ctrlWheelDown' && command === 'zoom-out')
				|| (gesture === 'ctrlWheelUp' && command === 'zoom-in')
			if (isStockDefault) return

			if (!runCommand(editor, command)) return
			event.preventDefault()
			event.stopPropagation()
		}

		container.addEventListener('wheel', onWheel, { capture: true, passive: false })
		return () => {
			unsubscribe()
			container.removeEventListener('wheel', onWheel, { capture: true })
		}
	}, [editor])

	// Pan/zoom speed, through tldraw's OWN camera options.
	//
	// WHY not a multiplier inside the wheel handler above: tldraw's camera owns
	// momentum, trackpad-vs-mouse detection and inertia, and `setCameraOptions`
	// is the seam it exposes for exactly this. Scaling deltas ourselves would
	// silently replace all of that with something cruder — the same "extend
	// through the engine's seam, never beside it" rule the shape utils follow.
	useEffect(() => {
		if (!editor) return
		const apply = (settings: GestureSettings) => {
			const stock = editor.getCameraOptions()
			editor.setCameraOptions({
				...stock,
				panSpeed: settings.panSpeedPercent / 100,
				zoomSpeed: settings.zoomSpeedPercent / 100,
			})
		}
		apply(getGestureSettings())
		return subscribeToGestureSettings(apply)
	}, [editor])

	// Paste under the cursor.
	//
	// WHY this is a separate effect keyed the same way: tldraw pastes at the
	// viewport centre unless it is given a point. It already exposes the pointer
	// in `editor.inputs.currentPagePoint`, so honouring the setting is a matter
	// of handing that to the paste, not of reimplementing paste.
	useEffect(() => {
		if (!editor) return
		let settings: GestureSettings = getGestureSettings()
		const unsubscribe = subscribeToGestureSettings((next) => { settings = next })

		const onPaste = (event: ClipboardEvent) => {
			if (!settings.pasteUnderCursor) return
			if (!event.clipboardData) return
			const target = event.target
			// Never touch a paste aimed at a text field — that is the browser's.
			if (target instanceof HTMLElement
				&& (target.matches('input, textarea, select') || target.isContentEditable)) return
			if (editor.getEditingShapeId()) return
			editor.markHistoryStoppingPoint('paste at cursor')
			editor.putExternalContent({
				type: 'text',
				text: event.clipboardData.getData('text/plain'),
				point: editor.inputs.getCurrentPagePoint(),
			}).catch(() => { /* an unsupported payload falls back to tldraw's own path */ })
		}
		window.addEventListener('paste', onPaste)
		return () => {
			unsubscribe()
			window.removeEventListener('paste', onPaste)
		}
	}, [editor])
}
