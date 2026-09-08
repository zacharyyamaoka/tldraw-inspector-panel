import { useCallback, useSyncExternalStore } from 'react'
import {
	DefaultMainMenu,
	DefaultMainMenuContent,
	TldrawUiMenuCheckboxItem,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	TldrawUiMenuSubmenu,
	getSnapshot,
	loadSnapshot,
	useEditor,
} from 'tldraw'
import {
	WHEEL_COMMAND_LABELS,
	WHEEL_GESTURE_LABELS,
	getGestureSettings,
	setGestureSettings,
	subscribeToGestureSettings,
	type WheelCommand,
	type WheelGesture,
} from './gestureSettings'

/**
 * The app's main menu: a File group and a Gesture control group above tldraw's
 * own menu, which is rendered UNCHANGED underneath.
 *
 * WHY built from `TldrawUiMenu*` rather than styled from scratch: Zach's
 * instruction was "copy the implementation we have right now in system sketch
 * but keep its styling to stock tldraw". Those primitives ARE the stock
 * styling — same submenu chevrons, same keyboard-shortcut column, same hover
 * and focus behaviour, same popover positioning — so nothing here needs a
 * stylesheet, and the new items cannot drift from the stock ones when tldraw
 * updates. `DefaultMainMenuContent` at the bottom keeps Edit/View/Export/
 * Preferences/Language/Keyboard shortcuts exactly as they ship.
 */
export function LabMainMenu() {
	return (
		<DefaultMainMenu>
			<FileMenu />
			<GestureMenu />
			<DefaultMainMenuContent />
		</DefaultMainMenu>
	)
}

function downloadSnapshot(editor: ReturnType<typeof useEditor>, filename: string) {
	const snapshot = getSnapshot(editor.store)
	const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	link.click()
	// Revoking on the next frame rather than immediately: Safari has been seen
	// cancelling the download when the URL dies in the same tick as the click.
	requestAnimationFrame(() => URL.revokeObjectURL(url))
}

function FileMenu() {
	const editor = useEditor()

	const onNew = useCallback(() => {
		const ids = [...editor.getCurrentPageShapeIds()]
		if (ids.length === 0) return
		editor.markHistoryStoppingPoint('new document')
		// Deleting the shapes rather than resetting the store: an undo has to
		// bring the board back. A store reset is not undoable, and losing a
		// board to a mis-click on New is the worst bug this menu could have.
		editor.deleteShapes(ids)
	}, [editor])

	const onOpen = useCallback(() => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.tldr,.json,application/json'
		input.onchange = async () => {
			const file = input.files?.[0]
			if (!file) return
			try {
				const snapshot = JSON.parse(await file.text())
				editor.markHistoryStoppingPoint('open document')
				loadSnapshot(editor.store, snapshot)
			} catch {
				// No toast API on the editor, and inventing chrome for this would be
				// a second UI kit. `alert` is ugly but it is HONEST — the alternative
				// people actually ship is a silent no-op, which looks like the app
				// ignoring the file it was just handed.
				window.alert('Could not open that file — it is not a tldraw snapshot.')
			}
		}
		input.click()
	}, [editor])

	return (
		<TldrawUiMenuGroup id="lab-file">
			<TldrawUiMenuSubmenu id="file" label="File">
				<TldrawUiMenuGroup id="file-new-open">
					<TldrawUiMenuItem id="new-document" label="New" kbd="cmd+n" onSelect={onNew} />
					<TldrawUiMenuItem id="open-document" label="Open…" kbd="cmd+o" onSelect={onOpen} />
				</TldrawUiMenuGroup>
				<TldrawUiMenuGroup id="file-save">
					<TldrawUiMenuItem
						id="save-document"
						label="Save"
						kbd="cmd+s"
						onSelect={() => downloadSnapshot(editor, 'board.tldr')}
					/>
					<TldrawUiMenuItem
						id="export-tldraw"
						label="Export to tldraw…"
						onSelect={() => downloadSnapshot(editor, 'board.tldr')}
					/>
				</TldrawUiMenuGroup>
				{/* WHY these are present but disabled rather than omitted: they are
				    the rest of SystemSketch's own File menu, and every one of them
				    needs a HOST this app does not have — a real filesystem path
				    (Show in Files, Move to Trash), a window manager (New window),
				    or a document identity to rename and to remember (Rename, Open
				    recent). Showing them greyed says "this menu is the same menu,
				    and these need the desktop app" — the same disabled-not-inert
				    rule the inspector already follows for Figma controls tldraw
				    cannot bind. Omitting them would quietly imply the menu is
				    complete. */}
				<TldrawUiMenuGroup id="file-host-only">
					<TldrawUiMenuItem id="new-window" label="New window" kbd="cmd+shift+n" disabled onSelect={() => {}} />
					<TldrawUiMenuItem id="open-recent" label="Open recent" disabled onSelect={() => {}} />
					<TldrawUiMenuItem id="rename-document" label="Rename" kbd="f2" disabled onSelect={() => {}} />
					<TldrawUiMenuItem id="reveal-document" label="Show in Files" disabled onSelect={() => {}} />
					<TldrawUiMenuItem id="trash-document" label="Move to Trash…" disabled onSelect={() => {}} />
				</TldrawUiMenuGroup>
			</TldrawUiMenuSubmenu>
		</TldrawUiMenuGroup>
	)
}

/** The commands offered for a wheel gesture, in the order they are listed. */
const COMMAND_ORDER: WheelCommand[] = [
	'none', 'pan-up', 'pan-down', 'pan-left', 'pan-right',
	'zoom-in', 'zoom-out', 'next-page', 'prev-page', 'undo', 'redo',
]

const GESTURE_ORDER: WheelGesture[] = ['wheelDown', 'wheelUp', 'ctrlWheelDown', 'ctrlWheelUp']

function GestureMenu() {
	// `useSyncExternalStore` rather than local state: the settings live outside
	// React (useGestures.ts reads them from a plain listener on every wheel
	// event, where a hook cannot go), so the menu has to render from that store
	// or the tick beside an item can disagree with what the wheel actually does.
	const settings = useSyncExternalStore(subscribeToGestureSettings, getGestureSettings, getGestureSettings)

	return (
		<TldrawUiMenuGroup id="lab-gestures">
			<TldrawUiMenuSubmenu id="gestures" label="Gesture control">
				<TldrawUiMenuGroup id="gesture-toggles">
					<TldrawUiMenuCheckboxItem
						id="paste-under-cursor"
						label="Copy/paste under cursor"
						checked={settings.pasteUnderCursor}
						onSelect={() => setGestureSettings({ ...settings, pasteUnderCursor: !settings.pasteUnderCursor })}
					/>
				</TldrawUiMenuGroup>
				<TldrawUiMenuGroup id="gesture-bindings">
					{GESTURE_ORDER.map((gesture) => (
						<TldrawUiMenuSubmenu
							key={gesture}
							id={`gesture-${gesture}`}
							label={`${WHEEL_GESTURE_LABELS[gesture]} · ${WHEEL_COMMAND_LABELS[settings.bindings[gesture]]}`}
						>
							<TldrawUiMenuGroup id={`gesture-${gesture}-commands`}>
								{COMMAND_ORDER.map((command) => (
									<TldrawUiMenuCheckboxItem
										key={command}
										id={`gesture-${gesture}-${command}`}
										label={WHEEL_COMMAND_LABELS[command]}
										checked={settings.bindings[gesture] === command}
										onSelect={() => setGestureSettings({
											...settings,
											bindings: { ...settings.bindings, [gesture]: command },
										})}
									/>
								))}
							</TldrawUiMenuGroup>
						</TldrawUiMenuSubmenu>
					))}
				</TldrawUiMenuGroup>
			</TldrawUiMenuSubmenu>
		</TldrawUiMenuGroup>
	)
}
