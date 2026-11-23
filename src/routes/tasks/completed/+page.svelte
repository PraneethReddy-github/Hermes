<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { optimistic, pending } from '../../../lib/stores/tasks.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const shown = $derived(data.tasks.filter((t) => !pending.has(t.id)));
</script>

<svelte:head><title>Completed · Hermes</title></svelte:head>

<main>
	<TopBar title="Completed" />
	<p class="back"><a href={resolve('/tasks')}>Back to tasks</a> · last 30 days</p>
	{#if shown.length}
		<ul aria-label="Completed tasks">
			{#each shown as t (t.id)}
				<li data-task-id={t.id}>
					<span class="title">{t.title}</span>
					<form
						method="POST"
						action="/tasks/{t.id}?/uncomplete"
						use:enhance={optimistic(t.id, { hide: true })}
					>
						<button class="ghost" data-focus aria-label="Undo {t.title}">Undo</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<EmptyState title="Nothing completed yet" />
	{/if}
</main>

<style>
	.back {
		margin: 0 0 8px;
		color: var(--text-muted);
	}
	ul {
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		border-bottom: 1px solid var(--border);
		list-style: none;
	}
	.title {
		flex: 1;
		color: var(--text-muted);
		text-decoration: line-through;
		overflow-wrap: anywhere;
	}
</style>
