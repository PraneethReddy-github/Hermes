<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { KIND_LABELS, KIND_PLURALS } from '../../lib/notes';
	import type { NoteKind } from '../../lib/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const FILTERS: [NoteKind | null, string][] = [
		[null, 'All'],
		...(Object.entries(KIND_PLURALS) as [NoteKind, string][])
	];
	const go = (k: NoteKind | null) =>
		goto(resolve(`/notes${k ? `?kind=${k}` : ''}` as '/notes'), {
			replaceState: true,
			reset: false
		});
</script>

<svelte:head><title>Notes · Hermes</title></svelte:head>

<main>
	<TopBar title="Notes" />
	<p class="add"><a class="btn" href={resolve('/notes/new')}>+ Note</a></p>

	<div class="pills" role="radiogroup" aria-label="Kind">
		{#each FILTERS as [k, label] (k)}
			<label>
				<input
					type="radio"
					name="kind"
					value={k ?? ''}
					checked={k === data.kind}
					onchange={() => go(k)}
				/>
				<span>{label}</span>
			</label>
		{/each}
	</div>

	{#if data.notes.length}
		<ul aria-label="Notes">
			{#each data.notes as n (n.id)}
				<li>
					<a href={resolve('/notes/[id]', { id: n.id })}>
						<span class="text">
							<span class="name">{n.name || 'Untitled'}</span>
							{#if n.preview}<span class="preview">{n.preview}</span>{/if}
						</span>
						<span class="kind">{KIND_LABELS[n.kind]}</span>
						{#if n.pinned}<span class="pin" role="img" aria-label="Pinned">
								<Icon name="pin" size={18} />
							</span>{/if}
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<EmptyState
			title={data.kind ? `No ${KIND_PLURALS[data.kind].toLowerCase()}` : 'No notes yet'}
			hint="Tap + Note to write one."
		/>
	{/if}
</main>

<style>
	.add {
		margin: 0 0 12px;
	}
	.btn {
		display: inline-grid;
		place-items: center;
		min-height: 44px;
		padding: 0 16px;
		background: var(--accent-fill);
		color: var(--accent-ink);
		border-radius: var(--r-2);
		font-weight: 600;
		text-decoration: none;
	}
	.pills {
		display: flex;
		margin-bottom: 12px;
		overflow-x: auto;
	}
	label {
		position: relative;
		flex: none;
		margin: 0 0 0 -1px;
	}
	label:first-child {
		margin-left: 0;
	}
	input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.pills span {
		display: grid;
		place-items: center;
		min-height: 44px;
		padding: 0 16px;
		border: 1px solid var(--border-strong);
		background: var(--surface-2);
		color: var(--text-muted);
		font-weight: 500;
	}
	label:first-child span {
		border-radius: var(--r-1) 0 0 var(--r-1);
	}
	label:last-child span {
		border-radius: 0 var(--r-1) var(--r-1) 0;
	}
	input:checked + span {
		background: var(--surface-3);
		color: var(--text);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	input:focus-visible + span {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li a {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 8px 0;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		text-decoration: none;
	}
	.text {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.name {
		font-weight: 600;
	}
	.preview {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.name,
	.preview {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.kind {
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.pin {
		display: grid;
		color: var(--accent);
	}
</style>
