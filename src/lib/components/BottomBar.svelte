<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { openCapture } from '../stores/capture.svelte';
	import { NAV, isActive } from '../nav';
	import Icon from './Icon.svelte';
</script>

<nav class="bar" aria-label="Main">
	{#each NAV as item, i (item.href)}
		{#if i === 2}
			<button class="add" aria-label="Quick add" onclick={openCapture}>
				<Icon name="plus" size={28} />
			</button>
		{/if}
		<a
			href={resolve(item.href)}
			aria-label={item.label}
			aria-current={isActive(page.url.pathname, item.href) ? 'page' : undefined}
		>
			<Icon name={item.icon} />
			<span>{item.label}</span>
		</a>
	{/each}
</nav>

<style>
	.bar {
		position: fixed;
		inset: auto 0 0 0;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		align-items: center;
		padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
		background: var(--surface);
		border-top: 1px solid var(--border);
		z-index: 10;
	}
	a {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: 56px;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.75rem;
	}
	a[aria-current='page'] {
		color: var(--accent);
	}
	/* Active nav: a 2px gold line on the bar's top edge. */
	a[aria-current='page']::before {
		content: '';
		position: absolute;
		top: -1px;
		left: 20%;
		right: 20%;
		height: 2px;
		background: var(--accent);
	}
	.add {
		justify-self: center;
		width: 52px;
		height: 52px;
		min-height: 0;
		padding: 0;
		border-radius: var(--r-2);
		display: grid;
		place-items: center;
	}
	@media (min-width: 1024px) {
		.bar {
			display: none;
		}
	}
</style>
