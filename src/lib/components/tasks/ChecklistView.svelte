<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { Task } from '../../server/services/tasks';
	import { errorOf } from '../../stores/tasks.svelte';
	import { showToast } from '../../stores/toast.svelte';
	import EmptyState from '../EmptyState.svelte';

	let { projectId, open, done }: { projectId: string; open: Task[]; done: Task[] } = $props();

	let error = $state('');
	/** id -> done state the user asked for, until the server data catches up. */
	const want = new SvelteMap<string, boolean>();
	let doneOpen = $state(false);

	const all = $derived([
		...open.map((t) => ({ t, done: false })),
		...done.map((t) => ({ t, done: true }))
	]);
	const rows = $derived(all.map((r) => ({ ...r, done: want.get(r.t.id) ?? r.done })));
	const todo = $derived(rows.filter((r) => !r.done));
	const finished = $derived(rows.filter((r) => r.done));
	// An emptied Done group re-opens closed next time.
	$effect(() => {
		if (!finished.length) doneOpen = false;
	});

	const toggle =
		(id: string, done: boolean): SubmitFunction =>
		({ formElement, cancel }) => {
			if (want.has(id)) return cancel(); // double tap while the first is in flight
			const li = formElement.closest('li');
			const near = (li?.nextElementSibling ?? li?.previousElementSibling)?.getAttribute('data-id');
			want.set(id, done);
			void refocus(id, near);
			return async ({ result, update }) => {
				if (result.type === 'success') await update({ reset: false, navigate: false });
				else showToast(errorOf(result), { error: true });
				want.delete(id);
			};
		};

	/** The tapped button is destroyed when its row changes group: focus its twin, else a neighbour. */
	async function refocus(id: string, near?: string | null) {
		const had = !!document.activeElement?.closest('li[data-id]');
		await tick();
		if (!had) return;
		const btn = (i?: string | null) =>
			i ? document.querySelector<HTMLElement>(`li[data-id="${i}"] button`) : null;
		btn(id)?.focus();
		if (document.activeElement?.closest('li')?.dataset.id !== id) btn(near)?.focus();
	}

	const add: SubmitFunction = ({ formData, cancel }) => {
		if (!(formData.get('title') as string).trim()) return cancel();
		error = '';
		return async ({ result, update }) => {
			if (result.type === 'success') await update({ navigate: false });
			else error = errorOf(result);
		};
	};

	const clear: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type === 'success') {
				const ids = (result.data as { cleared: string[] }).cleared;
				showToast(`Cleared ${ids.length} ${ids.length === 1 ? 'item' : 'items'}`, {
					undo: `/projects/${projectId}?/restoreMany&ids=${ids.join(',')}`
				});
				await update({ reset: false, navigate: false });
			} else showToast(errorOf(result), { error: true });
		};
</script>

<form class="add" method="POST" action="?/add" use:enhance={add}>
	<input
		name="title"
		aria-label="Add item"
		placeholder="Add item"
		autocomplete="off"
		maxlength="500"
	/>
	{#if error}<p role="alert">{error}</p>{/if}
</form>

<ul aria-label="Items">
	{#each todo as r (r.t.id)}
		{@render item(r.t, false)}
	{:else}
		<EmptyState title="Nothing to get" hint="Add an item above." />
	{/each}
</ul>

{#if finished.length}
	<details bind:open={doneOpen}>
		<summary>Done ({finished.length})</summary>
		<form method="POST" action="?/clearDone" use:enhance={clear}>
			<button class="ghost">Clear done</button>
		</form>
		<ul aria-label="Done items">
			{#each finished as r (r.t.id)}
				{@render item(r.t, true)}
			{/each}
		</ul>
	</details>
{/if}

{#snippet item(t: Task, isDone: boolean)}
	<li data-id={t.id}>
		<form
			method="POST"
			action="/tasks/{t.id}?/{isDone ? 'uncomplete' : 'complete'}"
			use:enhance={toggle(t.id, !isDone)}
		>
			<button class="row" class:done={isDone} aria-pressed={isDone}>
				<span class="circle" class:done={isDone}></span>
				<span class="title">{t.title}</span>
			</button>
		</form>
	</li>
{/snippet}

<style>
	.add {
		margin-bottom: 16px;
	}
	.add input {
		min-height: 52px;
		margin-top: 0;
		font-size: 1.125rem;
	}
	p {
		margin: 4px 0 0;
		font-size: 0.875rem;
	}
	ul {
		margin: 0;
		padding: 0;
	}
	li {
		list-style: none;
		border-bottom: 1px solid var(--border);
	}
	li form {
		display: contents;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 52px;
		padding: 0 4px;
		background: none;
		border: 0;
		border-radius: 0;
		color: var(--text);
		font-size: 1.125rem;
		font-weight: 400;
		text-align: left;
	}
	.title {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.row.done {
		color: var(--text-muted);
	}
	.row.done .title {
		text-decoration: line-through;
	}
	.circle {
		flex: none;
		width: 24px;
		height: 24px;
		box-sizing: border-box;
		border: 2px solid var(--text-muted);
		border-radius: 50%;
	}
	.circle.done {
		background: var(--ok);
		border-color: var(--ok);
	}
	details {
		margin-top: 16px;
	}
	summary {
		display: flex;
		align-items: center;
		min-height: 44px;
		color: var(--text-muted);
	}
	details > form {
		margin-bottom: 8px;
	}
</style>
