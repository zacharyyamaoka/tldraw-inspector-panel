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
import { useSyncExternalStore } from 'react'
import { FileMenu, GestureMenu } from './LabMainMenu'
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
export function SettingsDialogVariant() {
	const { addDialog } = useDialogs()
	return (
		<DefaultMainMenu>
			<TldrawUiMenuGroup id="lab-file-v3">
				<FileMenu />
				<TldrawUiMenuItem
					id="open-settings"
					label="Settings…"
					kbd="cmd+,"
					onSelect={() => { addDialog({ component: ({ onClose }) => <SettingsDialog onClose={onClose} /> }) }}
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
			<TldrawUiDialogBody style={{ maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 16 }}>
				<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
					<input
						type="checkbox"
						data-testid="settings-paste-under-cursor"
						checked={settings.pasteUnderCursor}
						onChange={(event) => setGestureSettings({ ...settings, pasteUnderCursor: event.target.checked })}
					/>
					Copy/paste under cursor
				</label>

				<div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 12px', alignItems: 'center' }}>
					{GESTURES.map((gesture) => (
						<Row key={gesture} label={WHEEL_GESTURE_LABELS[gesture]}>
							<select
								data-testid={`settings-${gesture}`}
								value={settings.bindings[gesture]}
								onChange={(event) => setGestureSettings({
									...settings,
									bindings: { ...settings.bindings, [gesture]: event.target.value as WheelCommand },
								})}
							>
								{COMMANDS.map((command) => (
									<option key={command} value={command}>{WHEEL_COMMAND_LABELS[command]}</option>
								))}
							</select>
						</Row>
					))}
					<Row label="Scroll sensitivity">
						<Percent value={settings.panSpeedPercent} onPick={(panSpeedPercent) => setGestureSettings({ ...settings, panSpeedPercent })} testId="settings-pan-speed" />
					</Row>
					<Row label="Zoom sensitivity">
						<Percent value={settings.zoomSpeedPercent} onPick={(zoomSpeedPercent) => setGestureSettings({ ...settings, zoomSpeedPercent })} testId="settings-zoom-speed" />
					</Row>
				</div>
			</TldrawUiDialogBody>
			<TldrawUiDialogFooter className="tlui-dialog__footer__actions">
				<TldrawUiButton type="primary" onClick={onClose}><TldrawUiButtonLabel>Done</TldrawUiButtonLabel></TldrawUiButton>
			</TldrawUiDialogFooter>
		</>
	)
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<>
			<span style={{ fontSize: 13 }}>{label}</span>
			{children}
		</>
	)
}

function Percent({ value, onPick, testId }: { value: number; onPick(v: number): void; testId: string }) {
	return (
		<select data-testid={testId} value={value} onChange={(event) => onPick(Number(event.target.value))}>
			{SPEED_PERCENT_OPTIONS.map((percent) => (
				<option key={percent} value={percent}>{percent === 100 ? '100% (default)' : `${percent}%`}</option>
			))}
		</select>
	)
}
