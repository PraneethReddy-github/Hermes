/** True while a key press belongs to a text field or an open sheet, not to a global shortcut. */
export const isTyping = (e: KeyboardEvent): boolean =>
	e.ctrlKey ||
	e.metaKey ||
	e.altKey ||
	(e.target instanceof HTMLElement &&
		!!e.target.closest('input, textarea, select, [contenteditable], dialog'));
