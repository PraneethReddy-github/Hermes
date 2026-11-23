<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	const TABS = [
		{ href: '/tasks', label: 'Today' },
		{ href: '/tasks/upcoming', label: 'Upcoming' },
		{ href: '/tasks/projects', label: 'Projects' }
	] as const;
</script>

<nav aria-label="Task views">
	{#each TABS as t (t.href)}
		<a href={resolve(t.href)} aria-current={page.url.pathname === t.href ? 'page' : undefined}>
			{t.label}
		</a>
	{/each}
</nav>

<style>
	nav {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 2px;
		margin-bottom: 12px;
		background: var(--surface-2);
		border-radius: 10px;
	}
	a {
		display: grid;
		place-items: center;
		min-height: 44px;
		border-radius: 8px;
		color: var(--text-muted);
		text-decoration: none;
	}
	a[aria-current='page'] {
		background: var(--surface);
		color: var(--text);
		font-weight: 600;
	}
</style>
