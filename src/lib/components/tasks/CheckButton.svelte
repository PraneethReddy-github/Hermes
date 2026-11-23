<script lang="ts">
	// Submit button for a complete/uncomplete form: 24px circle inside a 44px hit target.
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
		width: 24px;
		height: 24px;
		box-sizing: border-box;
		border: 2px solid var(--text-muted);
		border-radius: 50%;
	}
	.circle.done {
		background: var(--ok);
		border-color: var(--ok);
	}
	.check:active .circle {
		background: var(--surface-2);
	}
</style>
