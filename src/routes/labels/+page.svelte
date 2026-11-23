<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import ColorSwatches from '#lib/components/ColorSwatches.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { errorOf } from '../../lib/stores/tasks.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let editId = $state<string | null>(null);
	let deleteId = $state<string | null>(null);
	let error = $state('');

	const deleting = $derived(data.labels.find((l) => l.id === deleteId));

	const act: SubmitFunction = () => async (e) => {
		if (e.result.type === 'success') {
			error = '';
			editId = deleteId = null;
			await e.update({ reset: false, navigate: false });
		} else error = errorOf(e.result);
	};
	const close = () => {
		editId = deleteId = null;
		error = '';
	};
</script>

<svelte:head><title>Labels · Hermes</title></svelte:head>

<main>
	<TopBar title="Labels" />
	<p class="nav"><a href={resolve('/projects')}>Projects</a></p>

	<ul aria-label="Labels">
		{#each data.labels as l (l.id)}
			<li>
				{#if editId === l.id}
					<form method="POST" action="?/update" use:enhance={act}>
						<input type="hidden" name="id" value={l.id} />
						<label>Name <input name="name" value={l.name} required maxlength="40" /></label>
						<ColorSwatches value={l.color} />
						{#if error}<p role="alert">{error}</p>{/if}
						<div class="btns">
							<button>Save</button>
							<button type="button" class="ghost" onclick={close}>Cancel</button>
						</div>
					</form>
				{:else}
					<a class="main" href={resolve('/labels/[id]', { id: l.id })}>
						<span class="dot" style:background={l.color ?? 'var(--border)'}></span>
						<span class="name">#{l.name}</span>
						<span class="count" aria-label="{l.open} open">{l.open}</span>
					</a>
					<button class="ghost" aria-label="Rename {l.name}" onclick={() => (editId = l.id)}>
						Edit
					</button>
					<button class="ghost" aria-label="Delete {l.name}" onclick={() => (deleteId = l.id)}>
						Delete
					</button>
				{/if}
			</li>
		{:else}
			<EmptyState title="No labels yet" hint="Add #label to a task and it shows up here." />
		{/each}
	</ul>
</main>

{#if deleting}
	<Sheet open title="Delete label" onclose={close}>
		<p>
			Delete <strong>#{deleting.name}</strong>? It is removed from
			{deleting.open === 1 ? '1 open task' : `${deleting.open} open tasks`}; the tasks stay.
		</p>
		<form method="POST" action="?/delete" use:enhance={act}>
			<input type="hidden" name="id" value={deleting.id} />
			{#if error}<p role="alert">{error}</p>{/if}
			<div class="btns">
				<button type="button" class="ghost" onclick={close}>Cancel</button>
				<button class="del">Delete label</button>
			</div>
		</form>
	</Sheet>
{/if}

<style>
	.nav {
		margin: 0 0 12px;
	}
	ul {
		margin: 0 0 16px;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 8px;
		list-style: none;
		border-bottom: 1px solid var(--border);
	}
	li form {
		flex: 1;
		padding: 8px 0;
	}
	.main {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 12px;
		min-width: 0;
		min-height: 52px;
		color: var(--text);
		text-decoration: none;
	}
	.dot {
		flex: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.count {
		min-width: 24px;
		color: var(--text-muted);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.btns {
		display: flex;
		gap: 8px;
	}
	.btns button {
		flex: 1;
	}
	.del {
		background: var(--danger);
		border-color: var(--danger);
		color: #fff;
	}
</style>
