export interface Toast {
	id: number;
	message: string;
	/** Form action URL (e.g. `/tasks/<id>?/uncomplete`) behind the Undo button. */
	undo?: string;
	error?: boolean;
}

export const toast = $state<{ current: Toast | null }>({ current: null });

let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export function dismissToast() {
	clearTimeout(timer);
	toast.current = null;
}

export function showToast(message: string, opts: { undo?: string; error?: boolean } = {}) {
	clearTimeout(timer);
	toast.current = { id: ++seq, message, ...opts };
	timer = setTimeout(dismissToast, 5000);
}
