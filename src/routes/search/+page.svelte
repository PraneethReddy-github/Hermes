<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import TaskSheet from '#lib/components/tasks/TaskSheet.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const KEY = 'hermes.recentSearches';
	// svelte-ignore state_referenced_locally
	let value = $state(data.q);
	let recent = $state<string[]>([]);
	let editId = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout>;

	const editing = $derived(data.taskRows.find((t) => t.id === editId));
	const total = $derived(
		data.results.tasks.length + data.results.events.length + data.results.notes.length
	);
	const groups = $derived([
		{ name: 'Tasks', hits: data.results.tasks },
		{ name: 'Events', hits: data.results.events },
		{ name: 'Notes', hits: data.results.notes }
	]);

	onMount(() => {
		try {
			const r: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
			if (Array.isArray(r)) recent = r.filter((x) => typeof x === 'string').slice(0, 8);
		} catch {
			// storage unavailable: no recents
		}
	});

	function remember() {
		const q = value.trim();
		if (!q) return;
		recent = [q, ...recent.filter((r) => r !== q)].slice(0, 8);
		try {
			localStorage.setItem(KEY, JSON.stringify(recent));
		} catch {
			// storage unavailable
		}
	}

	function go(q: string) {
		const url = resolve(`/search${q.trim() ? `?q=${encodeURIComponent(q)}` : ''}` as '/search');
		void goto(url, { replaceState: true, reset: false });
	}
	function oninput() {
		clearTimeout(timer);
		timer = setTimeout(() => go(value), 150);
	}
	function pick(q: string) {
		value = q;
		go(q);
	}
	// Even index = plain text, odd = highlighted match (U+0002 ... U+0003).
	const parts = (s: string) => s.replaceAll('\u0003', '\u0002').split('\u0002');
</script>

{#snippet snip(s: string)}
	{#if s}
		<span class="snip">
			{#each parts(s) as p, i (i)}{#if i % 2}<mark>{p}</mark>{:else}{p}{/if}{/each}
		</span>
	{/if}
{/snippet}

<svelte:head><title>Search · Hermes</title></svelte:head>

<main>
	<TopBar title="Search" />
	<form method="GET" action={resolve('/search')} role="search" onsubmit={remember}>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			type="search"
			name="q"
			aria-label="Search"
			placeholder="Search tasks, events, notes"
			autocomplete="off"
			autofocus
			maxlength="200"
			bind:value
			{oninput}
		/>
	</form>

	<div aria-live="polite">
		{#if !data.q.trim()}
			{#if recent.length}
				<section aria-label="Recent searches">
					<h2>Recent</h2>
					<ul>
						{#each recent as r (r)}
							<li><button type="button" class="row" onclick={() => pick(r)}>{r}</button></li>
						{/each}
					</ul>
				</section>
			{/if}
		{:else if total === 0}
			<EmptyState title="No matches for “{data.q}”" />
		{:else}
			{#each groups as g (g.name)}
				{#if g.hits.length}
					<section aria-label={g.name}>
						<h2>{g.name} ({g.hits.length})</h2>
						<ul>
							{#each g.hits as h (h.id)}
								<li>
									{#if g.name === 'Tasks'}
										<button
											type="button"
											class="row"
											onclick={() => {
												remember();
												editId = h.id;
											}}
										>
											{@render body(h)}
										</button>
									{:else}
										<a
											class="row"
											onclick={remember}
											href={g.name === 'Events'
												? resolve(`/calendar?view=agenda&date=${h.date}` as '/calendar')
												: resolve('/notes/[id]', { id: h.id })}
										>
											{@render body(h)}
										</a>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/each}
		{/if}
	</div>
</main>

{#snippet body(h: (typeof data.results.tasks)[number])}
	<span class="title">
		{h.title || 'Untitled'}
		{#if h.done}<span class="badge">Done</span>{/if}
	</span>
	{#if h.extra}<span class="extra">{h.extra}</span>{/if}
	{@render snip(h.snippet)}
{/snippet}

{#if editing}
	{#key editing.id}
		<TaskSheet
			task={editing}
			timeZone={data.timeZone}
			projects={data.projects}
			labelNames={data.labelNames}
			onclose={() => (editId = null)}
		/>
	{/key}
{/if}

<style>
	input[type='search'] {
		width: 100%;
		min-height: 44px;
		box-sizing: border-box;
		padding: 0 12px;
		font: inherit;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	h2 {
		margin: 16px 0 4px;
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 600;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		min-height: 44px;
		box-sizing: border-box;
		padding: 8px 4px;
		font: inherit;
		text-align: left;
		color: var(--text);
		background: none;
		border: 0;
		border-bottom: 1px solid var(--border);
		text-decoration: none;
		cursor: pointer;
	}
	.title {
		font-weight: 600;
	}
	.badge {
		margin-left: 6px;
		padding: 0 6px;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.extra,
	.snip {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	mark {
		color: inherit;
		background: color-mix(in srgb, var(--accent, gold) 30%, transparent);
		border-radius: 2px;
	}
</style>
