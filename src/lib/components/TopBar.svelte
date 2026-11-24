<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	let { title }: { title: string } = $props();
</script>

<header>
	<h1 tabindex="-1">{title}</h1>
	<a href={resolve('/search')} aria-label="Search"><Icon name="search" /></a>
	<a href={resolve('/settings')} aria-label="Settings"><Icon name="settings" /></a>
</header>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding-top: env(safe-area-inset-top);
		margin-bottom: 8px;
	}
	h1 {
		flex: 1;
		margin: 0;
		font-size: 1.375rem;
		letter-spacing: -0.01em;
	}
	a {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		color: var(--text-muted);
	}
	/* The sidebar already has Search and Settings. */
	@media (min-width: 1024px) {
		a {
			display: none;
		}
	}
</style>
