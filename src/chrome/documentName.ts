import { useSyncExternalStore } from 'react'

/**
 * The board's name — the one piece of document identity this app has.
 *
 * WHY it lives here and not in the tldraw store: a name is not a shape, and
 * writing it into a record would be exactly the leak the whole architecture
 * exists to prevent (see src/inspector/overrides.ts). tldraw's own document
 * record has a `name` field, but it is not part of the `.tldr` contract we
 * hand people, so keeping ours beside the store means a board file stays a
 * board file. It persists per browser, like the gesture settings next to it.
 */
const STORAGE_KEY = 'tldraw-lab.document-name.v1'
const DEFAULT_NAME = 'Untitled board'

let current: string | null = null
const listeners = new Set<() => void>()

export function getDocumentName(): string {
	if (current === null) {
		try {
			current = localStorage.getItem(STORAGE_KEY) || DEFAULT_NAME
		} catch {
			current = DEFAULT_NAME
		}
	}
	return current
}

export function setDocumentName(name: string): void {
	current = name || DEFAULT_NAME
	try {
		localStorage.setItem(STORAGE_KEY, current)
	} catch {
		// Private mode or a blocked origin: the name still works this session.
	}
	for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function useDocumentName(): string {
	return useSyncExternalStore(subscribe, getDocumentName, getDocumentName)
}
