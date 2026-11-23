<script lang="ts">
	let { title, hint }: { title: string; hint?: string } = $props();
</script>

<div class="empty">
	<p class="title">{title}</p>
	{#if hint}<p class="hint">{hint}</p>{/if}
</div>

<style>
	.empty {
		text-align: center;
		padding: 48px 16px;
		color: var(--text-muted);
	}
	p {
		margin: 0;
	}
	.title {
		color: var(--text);
		font-weight: 600;
	}
	.hint {
		margin-top: 4px;
	}
</style>
