<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { openCapture } from '../stores/capture.svelte';
	import { NAV, isActive } from '../nav';
	import Icon from './Icon.svelte';

	const items = [
		...NAV,
		{ href: '/search', label: 'Search', icon: 'search' },
		{ href: '/settings', label: 'Settings', icon: 'settings' }
	] as const;
</script>

<nav class="side" aria-label="Main">
	<strong class="brand">Hermes</strong>
	<button class="add" onclick={openCapture}>
		<Icon name="plus" size={20} /> Quick add
	</button>
	{#each items as item (item.href)}
		<a
			href={resolve(item.href)}
			aria-current={isActive(page.url.pathname, item.href) ? 'page' : undefined}
		>
			<Icon name={item.icon} size={20} />
			{item.label}
		</a>
	{/each}
</nav>

<style>
	.side {
		display: none;
	}
	@media (min-width: 1024px) {
		.side {
			display: flex;
			flex-direction: column;
			gap: 4px;
			position: fixed;
			inset: 0 auto 0 0;
			width: 220px;
			padding: 16px 12px;
			background: var(--surface);
			border-right: 1px solid var(--border);
		}
	}
	.brand {
		padding: 8px 12px 16px;
		color: var(--accent);
		font-size: 1.25rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.add {
		justify-content: flex-start;
		margin-bottom: 8px;
	}
	a,
	.add {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 0 12px;
		border-radius: var(--r-1);
	}
	a {
		color: var(--text-muted);
		text-decoration: none;
		transition: background-color var(--t-fast) var(--ease);
	}
	a:hover {
		background: var(--surface-3);
	}
	a[aria-current='page'] {
		color: var(--accent);
		background: var(--surface-3);
		box-shadow: inset 2px 0 0 var(--accent);
	}
</style>
