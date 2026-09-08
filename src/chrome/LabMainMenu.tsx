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
import { getDocumentName, setDocumentName } from './documentName'
import {
	SPEED_PERCENT_OPTIONS,
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

export function FileMenu() {
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
					<TldrawUiMenuItem
						id="new-window"
						label="New window"
						kbd="cmd+shift+n"
						onSelect={() => {
							// A real second window of this app, which is all "New window"
							// ever meant. `noopener` so the child cannot reach back through
							// `window.opener` — the default is a genuine security footgun.
							window.open(window.location.href, '_blank', 'noopener,noreferrer')
						}}
					/>
					<TldrawUiMenuItem id="open-document" label="Open…" kbd="cmd+o" onSelect={onOpen} />
					<TldrawUiMenuItem id="open-recent" label="Open recent" disabled onSelect={() => {}} />
				</TldrawUiMenuGroup>
				<TldrawUiMenuGroup id="file-save">
					<TldrawUiMenuItem
						id="save-document"
						label="Save"
						kbd="cmd+s"
						onSelect={() => downloadSnapshot(editor, `${getDocumentName()}.tldr`)}
					/>
					<TldrawUiMenuItem
						id="save-as-document"
						label="Save As…"
						kbd="cmd+shift+s"
						onSelect={() => {
							// A prompt, not a file dialog: the browser will not tell a page
							// where a download went, so "Save As" here means "name it", and
							// the rest is the browser's own download UI. Pretending otherwise
							// with a fake path would be the dishonest version.
							const name = window.prompt('Save board as', getDocumentName())
							if (name === null) return
							const trimmed = name.trim() || getDocumentName()
							setDocumentName(trimmed)
							downloadSnapshot(editor, `${trimmed}.tldr`)
						}}
					/>
					<TldrawUiMenuItem
						id="export-tldraw"
						label="Export to tldraw…"
						onSelect={() => downloadSnapshot(editor, `${getDocumentName()}.tldr`)}
					/>
					<TldrawUiMenuItem
						id="rename-document"
						label="Rename"
						kbd="f2"
						onSelect={() => {
							const name = window.prompt('Rename board', getDocumentName())
							if (name === null) return
							setDocumentName(name.trim() || getDocumentName())
						}}
					/>
				</TldrawUiMenuGroup>
				{/* WHY only these two stay disabled: Zach asked why New window was
				    greyed — it should not have been. A browser opens a window with
				    `window.open`, and Save As and Rename only ever needed a document
				    NAME, which this app can now hold. What is left genuinely needs a
				    filesystem this page cannot reach: there is no path to reveal and
				    no trash to move a downloaded file into. Those two stay visible
				    and greyed rather than hidden — the same disabled-not-inert rule
				    the inspector uses — so the menu never implies it is complete. */}
				<TldrawUiMenuGroup id="file-host-only">
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

export function GestureMenu() {
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
				<TldrawUiMenuGroup id="gesture-speed">
					<SpeedSubmenu
						id="pan-speed"
						label="Scroll sensitivity"
						value={settings.panSpeedPercent}
						onPick={(panSpeedPercent) => setGestureSettings({ ...settings, panSpeedPercent })}
					/>
					<SpeedSubmenu
						id="zoom-speed"
						label="Zoom sensitivity"
						value={settings.zoomSpeedPercent}
						onPick={(zoomSpeedPercent) => setGestureSettings({ ...settings, zoomSpeedPercent })}
					/>
				</TldrawUiMenuGroup>
			</TldrawUiMenuSubmenu>
		</TldrawUiMenuGroup>
	)
}

function SpeedSubmenu({ id, label, value, onPick }: {
	id: string
	label: string
	value: number
	onPick(percent: number): void
}) {
	return (
		<TldrawUiMenuSubmenu id={id} label={`${label} · ${value}%`}>
			<TldrawUiMenuGroup id={`${id}-options`}>
				{SPEED_PERCENT_OPTIONS.map((percent) => (
					<TldrawUiMenuCheckboxItem
						key={percent}
						id={`${id}-${percent}`}
						label={percent === 100 ? '100% (tldraw default)' : `${percent}%`}
						checked={value === percent}
						onSelect={() => onPick(percent)}
					/>
				))}
			</TldrawUiMenuGroup>
		</TldrawUiMenuSubmenu>
	)
}
