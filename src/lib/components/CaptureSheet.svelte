<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { asType, classifyCapture } from '../capture/classify';
	import { capture } from '../stores/capture.svelte';
	import { errorOf } from '../stores/tasks.svelte';
	import { showToast } from '../stores/toast.svelte';
	import type { CaptureType } from '../types';
	import Sheet from './Sheet.svelte';
	import Toast from './Toast.svelte';
	import Chips from './tasks/Chips.svelte';

	let { timeZone, projectNames }: { timeZone: string; projectNames: string[] } = $props();

	const PILLS: [CaptureType, string][] = [
		['task', 'Task'],
		['event', 'Event'],
		['note', 'Note'],
		['shopping', 'Shopping']
	];

	let text = $state('');
	let picked = $state<CaptureType | null>(null); // the user's own choice; sticks while typing
	let error = $state('');
	let input = $state<HTMLInputElement>();

	const opts = $derived({ now: new Date(), timeZone, projectNames });
	const auto = $derived(classifyCapture(text, opts).type);
	const type = $derived(picked ?? auto);
	const chips = $derived(
		type === 'task' && text.trim() ? (asType(text, 'task', opts).quick?.chips ?? []) : []
	);

	function remove(i: number) {
		const { start, end } = chips[i];
		text = (text.slice(0, start) + text.slice(end)).replace(/\s{2,}/g, ' ').trimStart();
		input?.focus();
	}

	const submit: SubmitFunction = ({ cancel }) => {
		const [sent, choice] = [text, picked];
		if (!sent.trim()) return cancel();
		error = '';
		text = ''; // optimistic: back in the input if the server refuses
		picked = null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				const { place, undo } = (result.data as { saved: { place: string; undo: string } }).saved;
				showToast(`Saved to ${place}`, { undo });
				await update({ reset: false, navigate: false });
			} else {
				if (!text) [text, picked] = [sent, choice];
				error = errorOf(result);
			}
			input?.focus();
		};
	};
</script>

<Sheet open={capture.open} onclose={() => (capture.open = false)} title="Quick add">
	<form method="POST" action="/capture?/save" use:enhance={submit}>
		<input
			bind:this={input}
			bind:value={text}
			name="text"
			aria-label="Capture"
			placeholder="meet Anna thu 14-15 · buy eggs · idea: …"
			autocomplete="off"
			enterkeyhint="done"
			oninput={() => (error = '')}
		/>
		<div class="pills" role="radiogroup" aria-label="Type">
			{#each PILLS as [value, label] (value)}
				<label class:auto={!picked && type === value}>
					<input
						type="radio"
						name="type"
						{value}
						checked={type === value}
						onchange={() => (picked = value)}
					/>
					{label}
					{#if !picked && type === value && text.trim()}<small aria-hidden="true">auto</small>{/if}
				</label>
			{/each}
		</div>
		{#if error}<p role="alert">{error}</p>{/if}
		<Chips {chips} onremove={remove} />
	</form>
	<Toast inline />
</Sheet>

<style>
	input:not([type='radio']) {
		font-size: 1rem; /* below 16px iOS zooms the page on focus */
	}
	.pills {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}
	.pills label {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-height: 44px;
		margin: 0;
		border: 1px solid var(--border);
		border-radius: 22px;
		background: var(--surface-2);
		color: var(--text);
		cursor: pointer;
	}
	/* The radio stays in the layout (arrow keys, focus) but is covered by its label. */
	.pills input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.pills label:has(:checked) {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
	}
	.pills label:has(:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	small {
		font-size: 0.6875rem;
		opacity: 0.8;
	}
	p {
		margin: 8px 0 0;
		font-size: 0.875rem;
	}
</style>
