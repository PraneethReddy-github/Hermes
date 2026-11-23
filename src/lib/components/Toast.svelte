<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { optimistic } from '../stores/tasks.svelte';
	import { dismissToast, toast } from '../stores/toast.svelte';

	// `inline`: sits in the flow (inside the capture sheet, which covers the page-level toast).
	let { inline = false }: { inline?: boolean } = $props();

	const undo: SubmitFunction = (input) => {
		dismissToast();
		return optimistic()(input);
	};
</script>

<div class="toasts" class:inline role="status">
	{#if toast.current}
		{@const t = toast.current}
		<div class="toast" class:error={t.error}>
			<span>{t.message}</span>
			{#if t.undo}
				<form method="POST" action={t.undo} use:enhance={undo}>
					<button class="ghost">Undo</button>
				</form>
			{/if}
		</div>
	{/if}
</div>

<style>
	.toasts {
		position: fixed;
		inset: auto 16px calc(80px + env(safe-area-inset-bottom)) 16px;
		display: grid;
		justify-items: center;
		pointer-events: none;
		z-index: 20;
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		padding: 0 4px 0 16px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.3);
		pointer-events: auto;
		animation: rise 150ms ease-out;
	}
	.toast.error {
		border-color: var(--danger);
	}
	.ghost {
		border: 0;
		color: var(--accent);
	}
	.toasts.inline {
		position: static;
		inset: auto;
		margin-top: 12px;
		justify-items: start;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	@media (min-width: 1024px) {
		.toasts:not(.inline) {
			inset: auto 16px 16px 236px;
			justify-items: start;
		}
	}
</style>
