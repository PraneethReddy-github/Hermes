import type { SubmitFunction } from '$app/forms';
import { showToast } from '../stores/toast.svelte';

/** use:enhance handler for settings forms: stay on the page, toast the outcome. */
export const saved =
	(onFail?: () => void): SubmitFunction =>
	() =>
	async ({ result, update }) => {
		await update({ reset: false, navigate: false });
		if (result.type === 'success') return showToast('Saved');
		onFail?.();
		const msg: unknown = result.type === 'failure' ? result.data?.error : null;
		showToast(typeof msg === 'string' ? msg : 'Could not save', { error: true });
	};
