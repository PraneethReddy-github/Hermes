<script lang="ts">
	const LABEL = ['', 'Low priority', 'Medium priority', 'High priority', 'Urgent'];
	let { priority }: { priority: number } = $props();
</script>

{#if priority > 0}
	<span class="dot p{priority}" role="img" aria-label={LABEL[priority]}></span>
{/if}

<style>
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: var(--r-1);
		background: var(--text-muted);
	}
	.p2 {
		background: var(--info);
	}
	.p3 {
		background: var(--warn);
	}
	.p4 {
		background: var(--danger);
	}
</style>
