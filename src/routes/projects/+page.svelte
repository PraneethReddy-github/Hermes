<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import ColorSwatches from '#lib/components/ColorSwatches.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { SWATCHES } from '../../lib/swatches';
	import { errorOf } from '../../lib/stores/tasks.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let editId = $state<string | null>(null);
	let deleteId = $state<string | null>(null);
	let error = $state('');

	const active = $derived(data.projects.filter((p) => !p.archived));
	const archived = $derived(data.projects.filter((p) => p.archived));
	const editing = $derived(data.projects.find((p) => p.id === editId));
	const deleting = $derived(data.projects.find((p) => p.id === deleteId));

	const act: SubmitFunction = () => async (e) => {
		if (e.result.type === 'success') {
			error = '';
			editId = deleteId = null;
			await e.update({ navigate: false });
		} else error = errorOf(e.result);
	};
	const close = () => {
		editId = deleteId = null;
		error = '';
	};
</script>

<svelte:head><title>Projects · Hermes</title></svelte:head>

<main>
	<TopBar title="Projects" />
	<p class="nav"><a href={resolve('/labels')}>Labels</a></p>

	<form class="card" method="POST" action="?/create" use:enhance={act}>
		<h2>New project</h2>
		<label>Name <input name="name" required maxlength="60" autocomplete="off" /></label>
		<ColorSwatches value={SWATCHES[0].value} />
		<label>
			Kind
			<select name="kind">
				<option value="list">List</option>
				<option value="checklist">Checklist (shopping style)</option>
			</select>
		</label>
		{#if error && !editId && !deleteId}<p role="alert">{error}</p>{/if}
		<button>Add project</button>
	</form>

	<ul aria-label="Projects">
		{#each active as p (p.id)}
			<li>
				<a class="main" href={resolve('/projects/[id]', { id: p.id })}>
					<span class="dot" style:background={p.color ?? 'var(--border-strong)'}></span>
					<span class="name">{p.name}</span>
					{#if p.kind === 'checklist'}<span class="kind">Checklist</span>{/if}
					<span class="count" aria-label="{p.open} open">{p.open}</span>
				</a>
				<button class="ghost" aria-label="Edit {p.name}" onclick={() => (editId = p.id)}>
					Edit
				</button>
			</li>
		{/each}
	</ul>

	{#if archived.length}
		<details>
			<summary>Archived (<span class="mono">{archived.length}</span>)</summary>
			<ul aria-label="Archived projects">
				{#each archived as p (p.id)}
					<li>
						<a class="main" href={resolve('/projects/[id]', { id: p.id })}>
							<span class="dot" style:background={p.color ?? 'var(--border-strong)'}></span>
							<span class="name">{p.name}</span>
							<span class="count" aria-label="{p.open} open">{p.open}</span>
						</a>
						<form method="POST" action="?/unarchive" use:enhance={act}>
							<input type="hidden" name="id" value={p.id} />
							<button class="ghost" aria-label="Unarchive {p.name}">Unarchive</button>
						</form>
						<button class="ghost" aria-label="Delete {p.name}" onclick={() => (deleteId = p.id)}>
							Delete
						</button>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</main>

{#if editing}
	{#key editing.id}
		<Sheet open title="Edit project" onclose={close}>
			<form method="POST" action="?/update" use:enhance={act}>
				<input type="hidden" name="id" value={editing.id} />
				<label>Name <input name="name" value={editing.name} required maxlength="60" /></label>
				<ColorSwatches value={editing.color} />
				{#if error}<p role="alert">{error}</p>{/if}
				<button>Save</button>
			</form>
			{#if !editing.isDefault}
				<div class="danger">
					<form method="POST" action="?/archive" use:enhance={act}>
						<input type="hidden" name="id" value={editing.id} />
						<button class="ghost">Archive</button>
					</form>
					<button class="ghost" onclick={() => ((deleteId = editing.id), (editId = null))}>
						Delete
					</button>
				</div>
			{/if}
		</Sheet>
	{/key}
{/if}

{#if deleting}
	<Sheet open title="Delete project" onclose={close}>
		<p>
			Delete <strong>{deleting.name}</strong>? Its tasks move to Inbox.
		</p>
		<form method="POST" action="?/delete" use:enhance={act}>
			<input type="hidden" name="id" value={deleting.id} />
			{#if error}<p role="alert">{error}</p>{/if}
			<div class="danger">
				<button type="button" class="ghost" onclick={close}>Cancel</button>
				<button class="del">Delete project</button>
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
		display: contents;
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
		width: 8px;
		height: 8px;
		border-radius: var(--r-1);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.kind {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.count {
		min-width: 24px;
		color: var(--text-muted);
		text-align: right;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
	}
	summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		color: var(--text-muted);
	}
	.danger {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}
	.danger form {
		display: contents;
	}
	.danger button {
		flex: 1;
	}
	.del {
		background: var(--danger);
		border-color: var(--danger);
		color: var(--bg);
	}
</style>
