<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { isTyping } from '../../keys';
	import { parseQuickAdd } from '../../quickadd/parse';
	import { errorOf } from '../../stores/tasks.svelte';
	import { showToast } from '../../stores/toast.svelte';
	import Chips from './Chips.svelte';

	let {
		projectNames,
		timeZone,
		defaultProjectId
	}: { projectNames: string[]; timeZone: string; defaultProjectId?: string } = $props();

	let text = $state('');
	let error = $state('');
	let input: HTMLInputElement;

	const chips = $derived(
		text.trim() ? parseQuickAdd(text, { now: new Date(), timeZone, projectNames }).chips : []
	);

	function remove(i: number) {
		const { start, end } = chips[i];
		text = (text.slice(0, start) + text.slice(end)).replace(/\s{2,}/g, ' ').trimStart();
		input.focus();
	}

	function shortcut(e: KeyboardEvent) {
		if (e.key === 'n' && !isTyping(e)) {
			e.preventDefault();
			input.focus();
		}
	}

	const submit: SubmitFunction = ({ cancel }) => {
		const sent = text;
		if (!sent.trim()) return cancel();
		error = '';
		text = ''; // optimistic: back in the input if the server refuses
		return async ({ result, update }) => {
			if (result.type === 'success') {
				showToast(`Added “${String((result.data as { added: string }).added)}”`);
				await update({ reset: false, navigate: false });
			} else {
				if (!text) text = sent;
				error = errorOf(result);
			}
		};
	};
</script>

<svelte:window onkeydown={shortcut} />

<form method="POST" action="/tasks?/quickadd" use:enhance={submit}>
	<input type="hidden" name="projectId" value={defaultProjectId ?? ''} />
	<input
		bind:this={input}
		bind:value={text}
		name="text"
		aria-label="Quick add task"
		placeholder="Add a task… call Anna fri 5pm !2"
		autocomplete="off"
		enterkeyhint="done"
		oninput={() => (error = '')}
	/>
	{#if error}<p role="alert">{error}</p>{/if}
	<Chips {chips} onremove={remove} />
</form>

<style>
	form {
		margin-bottom: 16px;
	}
	input {
		margin-top: 0;
	}
	p {
		margin: 4px 0 0;
		font-size: 0.875rem;
	}
</style>
