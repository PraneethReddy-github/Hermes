<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import CaptureSheet from '#lib/components/CaptureSheet.svelte';
	import BottomBar from '#lib/components/BottomBar.svelte';
	import Sidebar from '#lib/components/Sidebar.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import { capture } from '../lib/stores/capture.svelte';
	import { isTyping } from '../lib/keys';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	// A theme change via the settings form re-runs the layout load; keep <html> in step.
	$effect(() => {
		document.documentElement.dataset.theme = data.theme;
	});
	const shell = $derived(
		data.signedIn && !['/login', '/setup', '/offline'].includes(page.url.pathname)
	);

	function shortcut(e: KeyboardEvent) {
		if (shell && e.key === '/' && !isTyping(e)) {
			e.preventDefault();
			void goto(resolve('/search'));
		}
	}

	onMount(async () => {
		document.documentElement.dataset.hydrated = ''; // e2e waits for this: load fires before hydration
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window onkeydown={shortcut} />

{#if shell}
	<Sidebar />
	<BottomBar />
	{#if data.capture}<CaptureSheet {...data.capture} />{/if}
	<!-- the sheet shows its own toast while open: a modal dialog covers this one -->
	{#if !capture.open}<Toast />{/if}
	<div class="shell">{@render children()}</div>
{:else}
	{@render children()}
{/if}

<style>
	.shell {
		padding-bottom: calc(72px + env(safe-area-inset-bottom));
	}
	@media (min-width: 1024px) {
		.shell {
			margin-left: 220px;
			padding-bottom: 0;
		}
	}
</style>
