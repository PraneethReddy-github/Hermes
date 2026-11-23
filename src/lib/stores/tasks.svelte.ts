import type { ActionResult, SubmitFunction } from '$app/forms';
import { tick } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import { showToast } from './toast.svelte';

/** Tasks hidden while their action is in flight (optimistic UI); lists filter on this. */
export const pending = new SvelteSet<string>();

export function errorOf(result: ActionResult): string {
	const data = result.type === 'failure' ? (result.data as { error?: unknown } | undefined) : null;
	return typeof data?.error === 'string' ? data.error : 'Something went wrong';
}

/** Where focus goes when a row disappears: next row, else previous, else the page heading. */
function focusTarget(id: string): HTMLElement | null {
	const li = document.querySelector(`[data-task-id="${CSS.escape(id)}"]`);
	for (const sib of [li?.nextElementSibling, li?.previousElementSibling]) {
		const el = sib?.querySelector<HTMLElement>('[data-focus]');
		if (el) return el;
	}
	return document.querySelector<HTMLElement>('main h1');
}

/**
 * `use:enhance` handler: hide the task and toast at once, reload the lists on success,
 * roll back and toast the error on failure.
 */
export function optimistic(
	id = '',
	o: { hide?: boolean; message?: string; undo?: string; onStart?: () => void } = {}
): SubmitFunction {
	return () => {
		if (o.hide) {
			const next = focusTarget(id);
			pending.add(id);
			void tick().then(() => next?.isConnected && next.focus());
		}
		if (o.message) showToast(o.message, { undo: o.undo });
		o.onStart?.();
		return async ({ result, update }) => {
			if (result.type === 'success') await update({ reset: false, navigate: false });
			else showToast(errorOf(result), { error: true });
			pending.delete(id);
		};
	};
}
