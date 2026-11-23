<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open,
		onclose,
		title,
		children
	}: { open: boolean; onclose: () => void; title: string; children: Snippet } = $props();

	let dialog: HTMLDialogElement;
	let dragY = $state(0);
	let startY: number | null = null;

	// showModal gives the focus trap, inert background and Esc (cancel event) for free.
	$effect(() => {
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	const down = (e: PointerEvent) => {
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};
	const move = (e: PointerEvent) => {
		if (startY !== null) dragY = Math.max(0, e.clientY - startY);
	};
	const up = () => {
		if (startY === null) return;
		const close = dragY > 80;
		startY = null;
		dragY = 0;
		if (close) onclose();
	};
</script>

<dialog
	bind:this={dialog}
	aria-label={title}
	style:transform={dragY ? `translateY(${dragY}px)` : undefined}
	oncancel={(e) => {
		e.preventDefault();
		onclose();
	}}
	onclose={() => open && onclose()}
	onclick={(e) => e.target === dialog && onclose()}
>
	<!-- Padding lives here, so only a click on the ::backdrop has the dialog itself as target. -->
	<div class="body">
		<div
			class="grab"
			role="presentation"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
		>
			<span></span>
		</div>
		<h2>{title}</h2>
		{@render children()}
	</div>
</dialog>

<style>
	dialog {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		padding: 0;
		/* Phone: bottom sheet. */
		margin: auto 0 0;
		width: 100%;
		max-width: none;
		border-radius: 12px 12px 0 0;
		animation: slide 200ms ease-out;
	}
	.body {
		padding: 0 16px calc(16px + env(safe-area-inset-bottom));
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.5);
	}
	.grab {
		display: grid;
		place-items: center;
		height: 28px;
		touch-action: none;
		cursor: grab;
	}
	.grab span {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--border);
	}
	h2 {
		margin: 0 0 12px;
		font-size: 1.125rem;
	}
	@keyframes slide {
		from {
			transform: translateY(100%);
		}
	}
	@media (min-width: 1024px) {
		dialog {
			margin: auto;
			width: 520px;
			border-radius: 12px;
			animation: none;
		}
		.body {
			padding-bottom: 16px;
		}
		.grab {
			display: none;
		}
	}
</style>
