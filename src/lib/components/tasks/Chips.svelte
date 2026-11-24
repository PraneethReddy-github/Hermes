<script lang="ts">
	import Icon from '../Icon.svelte';
	let {
		chips,
		label = 'Parsed tokens',
		onremove
	}: {
		chips: { kind: string; text: string }[];
		label?: string;
		onremove?: (index: number) => void;
	} = $props();
</script>

{#if chips.length}
	<ul aria-label={label}>
		{#each chips as c, i (i)}
			<li data-kind={c.kind}>
				<span>{c.text}</span>
				{#if onremove}
					<button type="button" class="x" aria-label="Remove {c.text}" onclick={() => onremove(i)}>
						<Icon name="close" size={14} />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		min-height: 32px;
		padding: 0 12px;
		border: 1px solid var(--border-strong);
		border-radius: var(--r-1);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}
	li[data-kind='priority'] {
		border-color: var(--warn);
	}
	li[data-kind='project'],
	li[data-kind='due'],
	li[data-kind='repeat'] {
		border-color: var(--accent);
	}
	li[data-kind='warning'] {
		border-color: var(--danger);
		color: var(--danger);
	}
	/* The visible × is small; the button itself is a 44px target overflowing the chip. */
	.x {
		display: grid;
		place-items: center;
		min-width: 44px;
		margin: -6px -12px -6px 0;
		padding: 0;
		background: none;
		border: 0;
		color: var(--text-muted);
	}
</style>
