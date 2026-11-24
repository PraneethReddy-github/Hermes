<script lang="ts">
	import { onMount } from 'svelte';

	let { source }: { source: string } = $props();

	// Loaded on the client only: the sanitiser needs a DOM, so SSR shows the plain text.
	let render = $state.raw<((s: string) => string) | null>(null);
	onMount(async () => {
		render = (await import('../markdown')).renderMarkdown;
	});
	const html = $derived(render ? render(source) : null);
</script>

{#if html === null}
	<p class="plain">{source}</p>
{:else}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by DOMPurify in renderMarkdown -->
	<div class="md" data-testid="markdown">{@html html}</div>
{/if}

<style>
	.plain {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.md {
		overflow-wrap: anywhere;
	}
	.md :global(> :first-child) {
		margin-top: 0;
	}
	.md :global(> :last-child) {
		margin-bottom: 0;
	}
	.md :global(h1),
	.md :global(h2),
	.md :global(h3) {
		margin: 16px 0 8px;
	}
	.md :global(pre),
	.md :global(code) {
		background: var(--surface-2);
		border-radius: var(--r-1);
	}
	.md :global(code) {
		padding: 1px 4px;
	}
	.md :global(pre) {
		padding: 8px 12px;
		overflow-x: auto;
	}
	.md :global(pre code) {
		padding: 0;
	}
	.md :global(blockquote) {
		margin: 8px 0;
		padding-left: 12px;
		border-left: 3px solid var(--border);
		color: var(--text-muted);
	}
	.md :global(img) {
		max-width: 100%;
	}
	.md :global(table) {
		border-collapse: collapse;
	}
	.md :global(th),
	.md :global(td) {
		border: 1px solid var(--border);
		padding: 4px 8px;
	}
</style>
