<script lang="ts">
	// Submit button for a complete/uncomplete form: 22px square inside a 44px hit target.
	let { label, done = false }: { label: string; done?: boolean } = $props();
</script>

<button class="check" aria-label={label}>
	<span class="circle" class:done></span>
</button>

<style>
	.check {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		flex: none;
		width: 44px;
		min-height: 44px;
		padding: 0;
		background: none;
		border: 0;
	}
	.circle {
		display: grid;
		place-content: center;
		width: 22px;
		height: 22px;
		box-sizing: border-box;
		border: 1.5px solid var(--border-strong);
		border-radius: var(--r-1);
		transition: background-color var(--t-fast) var(--ease);
	}
	.check:hover .circle {
		border-color: var(--text-muted);
	}
	.circle.done {
		background: var(--text);
		border-color: var(--text);
	}
	.circle.done::after {
		content: '';
		width: 10px;
		height: 5px;
		margin-top: -2px;
		border-left: 2px solid var(--bg);
		border-bottom: 2px solid var(--bg);
		transform: rotate(-45deg);
	}
	.check:active .circle {
		background: var(--surface-3);
	}
</style>
