import {
	DefaultMainMenu,
	DefaultMainMenuContent,
	TldrawUiButton,
	TldrawUiButtonLabel,
	TldrawUiDialogBody,
	TldrawUiDialogCloseButton,
	TldrawUiDialogFooter,
	TldrawUiDialogHeader,
	TldrawUiDialogTitle,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	TldrawUiMenuSubmenu,
	useDialogs,
} from 'tldraw'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { FileMenu, GestureMenu } from './LabMainMenu'
import { setTuningOpen } from './tuningStore'
import type React from 'react'
import { PercentInput } from './PercentInput'
import {
	DEFAULT_GESTURE_SETTINGS,
	MAX_SPEED_PERCENT,
	MIN_SPEED_PERCENT,
	clampSpeedPercent,
	WHEEL_COMMAND_LABELS,
	WHEEL_GESTURE_LABELS,
	getGestureSettings,
	setGestureSettings,
	subscribeToGestureSettings,
	type WheelCommand,
	type WheelGesture,
} from './gestureSettings'

/**
 * V2 — "One Board menu". Everything the app adds lives under a single
 * top-level entry, so the main menu grows by exactly one row no matter how
 * many app features arrive later.
 *
 * The thesis: tldraw's menu is short and that shortness is a feature. V1 adds
 * two rows; the next two features would add two more. Nesting keeps the stock
 * menu recognisable at a glance, and pays for it with one extra hop to reach
 * anything.
 */
export function BoardMenuVariant() {
	return (
		<DefaultMainMenu>
			<TldrawUiMenuGroup id="lab-board">
				<TldrawUiMenuSubmenu id="board" label="Board">
					<FileMenu />
					<GestureMenu />
				</TldrawUiMenuSubmenu>
			</TldrawUiMenuGroup>
			<DefaultMainMenuContent />
		</DefaultMainMenu>
	)
}

/**
 * V3 — "App bar + Settings". File stays a menu, but every tunable moves into
 * one real Settings dialog with radio lists instead of nested checkbox menus.
 *
 * The thesis: a menu is a good place to ACT and a bad place to CONFIGURE.
 * Choosing four wheel bindings through submenu-of-submenu means opening four
 * separate popovers and never seeing them together; a dialog shows the whole
 * mapping at once, which is how anyone actually reasons about a keymap.
 */
/** Opening Settings, in one place, so the menu item and the shortcut cannot drift. */
export function useOpenSettings() {
	const { addDialog, removeDialog } = useDialogs()
	return useCallback(() => {
		// A FIXED id, so a second open replaces the first instead of stacking a
		// second modal layer on top of it. Holding ctrl+, or pressing it while
		// Settings was already up used to produce two dialogs, with Escape
		// dismissing only the top one — leaving a modal the user could not see a
		// way out of.
		removeDialog(SETTINGS_DIALOG_ID)
		addDialog({
			id: SETTINGS_DIALOG_ID,
			component: ({ onClose }) => <SettingsDialog onClose={onClose} />,
		})
	}, [addDialog, removeDialog])
}

const SETTINGS_DIALOG_ID = 'lab-settings'

export function SettingsDialogVariant() {
	const openSettings = useOpenSettings()

	// WHY a real listener: `kbd="cmd+,"` on a menu item is only a LABEL — tldraw
	// renders the hint but registers nothing, so the shortcut Zach saw printed
	// beside the item did nothing when pressed ("Pressing control, comma,
	// doesn't open it right now"). Printing a shortcut that does not exist is
	// worse than printing none.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== ',' || !(event.ctrlKey || event.metaKey)) return
			// Key repeat fires this dozens of times while held.
			if (event.repeat) return
			const target = event.target
			if (target instanceof HTMLElement
				&& (target.matches('input, textarea, select') || target.isContentEditable)) return
			event.preventDefault()
			openSettings()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [openSettings])

	return (
		<DefaultMainMenu>
			<TldrawUiMenuGroup id="lab-file-v3">
				<FileMenu />
				<TldrawUiMenuItem
					id="open-settings"
					label="Settings…"
					kbd="cmd+,"
					onSelect={() => { openSettings() }}
				/>
			</TldrawUiMenuGroup>
			<DefaultMainMenuContent />
		</DefaultMainMenu>
	)
}

const COMMANDS: WheelCommand[] = [
	'none', 'pan-up', 'pan-down', 'pan-left', 'pan-right',
	'zoom-in', 'zoom-out', 'next-page', 'prev-page', 'undo', 'redo',
]
const GESTURES: WheelGesture[] = ['wheelDown', 'wheelUp', 'ctrlWheelDown', 'ctrlWheelUp']

function SettingsDialog({ onClose }: { onClose(): void }) {
	const settings = useSyncExternalStore(subscribeToGestureSettings, getGestureSettings, getGestureSettings)
	return (
		<>
			<TldrawUiDialogHeader>
				<TldrawUiDialogTitle>Settings</TldrawUiDialogTitle>
				<TldrawUiDialogCloseButton />
			</TldrawUiDialogHeader>
			{/* WHY inline styles off `--tl-*` tokens rather than this repo's own
			    Tailwind/shadcn classes: the dialog is tldraw's own shell, and Zach
			    asked for it to "better match clean tldraw stock UI". Borrowing the
			    engine's colour, radius and font tokens means it follows tldraw's
			    light/dark themes for free — a shadcn control here would be a second
			    design language inside a stock frame. */}
			<TldrawUiDialogBody style={{ maxWidth: 420, minWidth: 360 }}>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 0 8px' }}>
					<Section title="Pointer">
						<CheckRow
							label="Copy/paste under cursor"
							testId="settings-paste-under-cursor"
							checked={settings.pasteUnderCursor}
							onChange={(pasteUnderCursor) => setGestureSettings({ ...settings, pasteUnderCursor })}
						/>
					</Section>

					<Section title="Wheel">
						{GESTURES.map((gesture) => (
							<Row key={gesture} label={WHEEL_GESTURE_LABELS[gesture]}>
								<Picker
									testId={`settings-${gesture}`}
									value={settings.bindings[gesture]}
									options={COMMANDS.map((command) => ({ value: command, label: WHEEL_COMMAND_LABELS[command] }))}
									onChange={(value) => setGestureSettings({
										...settings,
										bindings: { ...settings.bindings, [gesture]: value as WheelCommand },
									})}
								/>
							</Row>
						))}
					</Section>

					<Section title="Sensitivity">
						<SpeedRow
							label="Scroll"
							testId="settings-pan-speed"
							value={settings.panSpeedPercent}
							onChange={(panSpeedPercent) => setGestureSettings({ ...settings, panSpeedPercent })}
						/>
						<SpeedRow
							label="Zoom"
							testId="settings-zoom-speed"
							value={settings.zoomSpeedPercent}
							onChange={(zoomSpeedPercent) => setGestureSettings({ ...settings, zoomSpeedPercent })}
						/>
					</Section>
				</div>
			</TldrawUiDialogBody>
			<TldrawUiDialogFooter className="tlui-dialog__footer__actions">
				<TldrawUiButton type="normal" onClick={() => setGestureSettings(DEFAULT_GESTURE_SETTINGS)}>
					<TldrawUiButtonLabel>Reset</TldrawUiButtonLabel>
				</TldrawUiButton>
				{/* WHY this closes the dialog rather than opening a panel beside it:
				    a sensitivity is judged by FEEL, and feel needs the board. Leaving
				    the modal up would keep the canvas blocked, which is the whole
				    complaint this button answers. */}
				<TldrawUiButton
					type="normal"
					data-testid="settings-tune-live"
					onClick={() => { setTuningOpen(true); onClose() }}
				>
					<TldrawUiButtonLabel>Tune live…</TldrawUiButtonLabel>
				</TldrawUiButton>
				<TldrawUiButton type="primary" onClick={onClose}>
					<TldrawUiButtonLabel>Done</TldrawUiButtonLabel>
				</TldrawUiButton>
			</TldrawUiDialogFooter>
		</>
	)
}

const LABEL_STYLE: React.CSSProperties = {
	fontSize: 12,
	color: 'var(--tl-color-text-1)',
	flex: '1 1 auto',
	minWidth: 0,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
			<div style={{
				fontSize: 11,
				fontWeight: 600,
				letterSpacing: '0.04em',
				textTransform: 'uppercase',
				color: 'var(--tl-color-text-3)',
				padding: '0 0 6px',
			}}>{title}</div>
			{children}
		</div>
	)
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 32 }}>
			<span style={LABEL_STYLE}>{label}</span>
			{children}
		</div>
	)
}

function CheckRow({ label, checked, onChange, testId }: {
	label: string
	checked: boolean
	onChange(next: boolean): void
	testId: string
}) {
	return (
		<label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32, cursor: 'pointer' }}>
			<input
				type="checkbox"
				data-testid={testId}
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				style={{ accentColor: 'var(--tl-color-selected)', width: 15, height: 15, margin: 0 }}
			/>
			<span style={LABEL_STYLE}>{label}</span>
		</label>
	)
}

const CONTROL_STYLE: React.CSSProperties = {
	height: 28,
	borderRadius: 'var(--tl-radius-2)',
	border: '1px solid var(--tl-color-low-border)',
	background: 'var(--tl-color-panel)',
	color: 'var(--tl-color-text-1)',
	font: 'inherit',
	fontSize: 12,
	padding: '0 6px',
	outline: 'none',
}

function Picker({ value, options, onChange, testId }: {
	value: string
	options: Array<{ value: string; label: string }>
	onChange(value: string): void
	testId: string
}) {
	return (
		<select
			data-testid={testId}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			style={{ ...CONTROL_STYLE, width: 150, flex: '0 0 auto' }}
		>
			{options.map((option) => (
				<option key={option.value} value={option.value}>{option.label}</option>
			))}
		</select>
	)
}

/**
 * A slider for feel and a number box for an exact value, kept in sync.
 *
 * WHY both: dragging is how you FIND the right sensitivity, and typing is how
 * you SET it — Zach asked for the second after using the first ("it would be
 * nice if I can set the scroll and zoom sensity exactly to a value that I
 * want"). The presets became slider detents rather than the whole vocabulary.
 */
function SpeedRow({ label, value, onChange, testId }: {
	label: string
	value: number
	onChange(percent: number): void
	testId: string
}) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 32 }}>
			<span style={LABEL_STYLE}>{label}</span>
			<input
				type="range"
				aria-label={`${label} sensitivity`}
				min={MIN_SPEED_PERCENT}
				max={MAX_SPEED_PERCENT}
				step={5}
				value={value}
				onChange={(event) => onChange(clampSpeedPercent(Number(event.target.value)))}
				style={{ accentColor: 'var(--tl-color-selected)', width: 108, flex: '0 0 auto' }}
			/>
			<PercentInput testId={testId} value={value} onCommit={onChange} style={{ ...CONTROL_STYLE, width: 60, flex: '0 0 auto', textAlign: 'right' }} />
			<span style={{ fontSize: 12, color: 'var(--tl-color-text-3)', width: 12 }}>%</span>
		</div>
	)
}
