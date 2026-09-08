/**
 * Whether the live-tuning panel is open.
 *
 * WHY a separate store rather than dialog state: the whole point of tuning mode
 * is that it is NOT a dialog. Zach, after trying to feel out a zoom speed
 * through the modal: "Can you not block my interactions with the whiteboard
 * when you have the settings menu up? ... have, like, a tuning button maybe I
 * can click where it allows me to still, like, interact with the whiteboard and
 * still have the settings menu there so I can, like, live tune."
 *
 * A modal is right for settings you SET and a trap for settings you FEEL — the
 * zoom speed only reveals itself against a moving canvas, and the dialog made
 * that impossible to try. So the modal stays for the full list, and this opens
 * a small non-modal panel beside the board.
 */
let open = false
const listeners = new Set<() => void>()

export function isTuningOpen(): boolean { return open }

export function setTuningOpen(next: boolean): void {
	open = next
	for (const listener of listeners) listener()
}

export function subscribeToTuning(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}
