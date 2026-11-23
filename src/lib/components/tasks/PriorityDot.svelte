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
		width: 10px;
		height: 10px;
		border-radius: 50%;
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
