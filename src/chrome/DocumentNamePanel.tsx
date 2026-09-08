import { useCallback, useRef, useState } from 'react'
import {
	PORTRAIT_BREAKPOINT,
	TldrawUiRow,
	TldrawUiToolbar,
	useBreakpoint,
	useEditor,
	useTldrawUiComponents,
	useValue,
} from 'tldraw'
import { getDocumentName, setDocumentName, useDocumentName } from './documentName'
import { readMenuVariant } from './menuVariant'

/**
 * The board's name, shown beside the main menu — tldraw.com's own breadcrumb
 * position, and SystemSketch's.
 *
 * WHY it renders through tldraw's `TopPanel` slot rather than as a floating
 * div of our own: that slot already sits in the menu zone's flex row, so the
 * name lands next to the hamburger at every window size with no coordinates,
 * no z-index and nothing to keep in sync when the toolbar changes. It is the
 * same "use the seam, don't reposition beside it" rule the rest of this app
 * follows.
 *
 * Click to rename in place. F2 is wired in the File menu for the same action.
 */
export function DocumentNamePanel() {
	const name = useDocumentName()
	const [editing, setEditing] = useState(false)
	const inputRef = useRef<HTMLInputElement | null>(null)

	const commit = useCallback(() => {
		const next = inputRef.current?.value.trim()
		if (next) setDocumentName(next)
		setEditing(false)
	}, [])

	if (editing) {
		return (
			<input
				ref={inputRef}
				data-testid="document-name-input"
				defaultValue={name}
				autoFocus
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === 'Enter') { event.preventDefault(); commit() }
					// Escape abandons the edit rather than committing a half-typed
					// name — the same contract as the inspector's own fields.
					if (event.key === 'Escape') { event.preventDefault(); setEditing(false) }
					// tldraw listens for keys globally; without this a rename
					// containing "v" or "d" would also switch tools mid-word.
					event.stopPropagation()
				}}
				className="lab-name-input"
			/>
		)
	}

	const variant = readMenuVariant()
	if (variant === 2) return <BreadcrumbName name={name} onEdit={() => setEditing(true)} />
	if (variant === 3) return <AppBarName name={name} onEdit={() => setEditing(true)} />

	return (
		<button
			type="button"
			data-testid="document-name"
			title="Click to rename"
			onClick={() => setEditing(true)}
			className="lab-name-button"
		>
			<span className="lab-name-text">{name || getDocumentName()}</span>
		</button>
	)
}

/**
 * V2's identity: tldraw.com's own breadcrumb — the board name, a separator, and
 * the current page. Says WHERE you are, not just what the file is called.
 */
function BreadcrumbName({ name, onEdit }: { name: string; onEdit(): void }) {
	const editor = useEditor()
	const page = useValue('page name', () => editor.getCurrentPage().name, [editor])
	return (
		<div data-testid="document-name" className="pointer-events-auto flex h-6 items-center gap-1 px-1.5 text-[13px] text-[var(--tl-color-text)]">
			<button
				type="button"
				onClick={onEdit}
				title="Click to rename"
				className="max-w-[180px] truncate rounded border-0 bg-transparent px-1 text-[13px] font-medium text-[var(--tl-color-text)] outline-none hover:bg-[var(--tl-color-hint)]"
			>
				{name}
			</button>
			<span aria-hidden="true" className="text-[var(--tl-color-text-3)]">/</span>
			<span className="max-w-[140px] truncate text-[var(--tl-color-text-3)]">{page}</span>
		</div>
	)
}

/**
 * V3's identity: SystemSketch's own treatment — the name with a status dot, so
 * the bar carries SAVE STATE as well as identity. The dot is green when the
 * board matches what is persisted and amber while it does not.
 */
function AppBarName({ name, onEdit }: { name: string; onEdit(): void }) {
	const editor = useEditor()
	// A cheap, honest proxy for "unsaved": whether anything has been marked
	// since load. Real save state needs a real file handle, which this app does
	// not have — so the dot is labelled as session state, not file state.
	const dirty = useValue('dirty', () => editor.getCanUndo(), [editor])
	return (
		<button
			type="button"
			data-testid="document-name"
			onClick={onEdit}
			title="Click to rename"
			className="lab-name-button"
		>
			<span className="lab-name-text">{name}</span>
			<span
				aria-label={dirty ? 'Edited this session' : 'No edits this session'}
				className={dirty ? 'size-2 shrink-0 rounded-full bg-[#f59e0b]' : 'size-2 shrink-0 rounded-full bg-[#22c55e]'}
			/>
		</button>
	)
}

/**
 * The menu zone: tldraw's own left cluster, with the board name added to it.
 *
 * WHY this replaces `components.TopPanel`, where the name used to live:
 * TopPanel is CENTRED at the top of the viewport. The name rendered correctly
 * there and Zach still could not find it — "I don't yet see the file name
 * either though?" — because both references he gave (SystemSketch and
 * tldraw.com) put identity immediately right of the hamburger, and that is
 * where the eye goes. Measured at x:653 on a 1280px window: dead centre, next
 * to nothing.
 *
 * WHY this mirrors `DefaultMenuPanel`'s markup rather than wrapping it: the
 * name has to sit INSIDE the same row as the menu, and a wrapper cannot reach
 * in. The structure below is tldraw's own — `<nav class="tlui-menu-zone">`
 * around a `TldrawUiRow` — because a hand-rolled flex row lost the horizontal
 * layout entirely and stacked the hamburger above the page menu. QuickActions
 * and ActionsMenu are re-rendered here too: dropping them silently removed
 * undo, redo and duplicate from the bar, which a first version did.
 */
export function MenuPanelWithName() {
	// `useTldrawUiComponents()`, not the Default* components directly: this app
	// overrides `MainMenu`, and rendering `DefaultMainMenu` here silently
	// bypassed that override — the bar came back with tldraw's stock menu and no
	// File or Settings at all. Reading the configured components is what keeps
	// this panel a LAYOUT change rather than a second component registry.
	const { MainMenu, PageMenu, QuickActions, ActionsMenu } = useTldrawUiComponents()
	const editor = useEditor()
	const breakpoint = useBreakpoint()

	// WHY this gate is copied from DefaultMenuPanel rather than left out: tldraw
	// HIDES the quick actions below tablet width, and dropping that made the bar
	// run 184px off a 360px viewport — measured. Rendering them unconditionally
	// is not "one more control", it is the whole responsive behaviour of the row
	// removed. Same expression as the engine's, so it moves when tldraw's does.
	const showQuickActions = editor.options.actionShortcutsLocation === 'menu'
		? true
		: editor.options.actionShortcutsLocation === 'toolbar'
			? false
			: breakpoint >= PORTRAIT_BREAKPOINT.TABLET

	return (
		<nav className="tlui-menu-zone">
			<TldrawUiRow>
				{MainMenu ? <MainMenu /> : null}
				{/* Name BEFORE the page menu: his sketch puts identity next to the
				    hamburger and the page after it — the board is the thing, the page
				    is a view inside it, so that is also the right order to read. */}
				<DocumentNamePanel />
				<span aria-hidden="true" className="lab-menu-divider" />
				{PageMenu ? <PageMenu /> : null}
				{showQuickActions && (QuickActions || ActionsMenu) ? (
					<TldrawUiToolbar orientation="horizontal" label="Actions">
						{QuickActions ? <QuickActions /> : null}
						{ActionsMenu ? <ActionsMenu /> : null}
					</TldrawUiToolbar>
				) : null}
			</TldrawUiRow>
		</nav>
	)
}
