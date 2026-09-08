import { useCallback, useRef, useState } from 'react'
import { getDocumentName, setDocumentName, useDocumentName } from './documentName'

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
				className="pointer-events-auto h-6 w-40 rounded border border-[var(--tl-color-selected)] bg-[var(--tl-color-panel)] px-1.5 text-[13px] text-[var(--tl-color-text)] outline-none"
			/>
		)
	}

	return (
		<button
			type="button"
			data-testid="document-name"
			title="Click to rename"
			onClick={() => setEditing(true)}
			className="pointer-events-auto flex h-6 max-w-[240px] items-center gap-1.5 truncate rounded border-0 bg-transparent px-1.5 text-[13px] text-[var(--tl-color-text)] outline-none hover:bg-[var(--tl-color-hint)]"
		>
			<span className="truncate">{name || getDocumentName()}</span>
		</button>
	)
}
