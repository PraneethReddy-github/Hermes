<script lang="ts">
	import { resolve } from '$app/paths';

	let {
		shoppingId,
		shoppingOpen,
		notes
	}: { shoppingId: string | null; shoppingOpen: number; notes: { id: string; title: string }[] } =
		$props();
</script>

{#if (shoppingId && shoppingOpen) || notes.length}
	<section>
		{#if shoppingId && shoppingOpen}
			<a class="card" href={resolve('/projects/[id]', { id: shoppingId })}>
				Shopping <b>{shoppingOpen}</b>
			</a>
		{/if}
		{#each notes as n (n.id)}
			<a class="card" href={resolve('/notes/[id]', { id: n.id })}>{n.title || 'Untitled'}</a>
		{/each}
	</section>
{/if}

<style>
	section {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 24px;
	}
	.card {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		box-sizing: border-box;
		max-width: 100%;
		padding: 0 16px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	b {
		color: var(--accent);
	}
</style>
