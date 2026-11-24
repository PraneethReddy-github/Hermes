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
		margin-bottom: 12px;
	}
	a {
		display: grid;
		place-items: center;
		min-height: 44px;
		margin-left: -1px;
		border: 1px solid var(--border-strong);
		background: var(--surface-2);
		color: var(--text-muted);
		font-weight: 500;
		text-decoration: none;
	}
	a:first-child {
		margin-left: 0;
		border-radius: var(--r-1) 0 0 var(--r-1);
	}
	a:last-child {
		border-radius: 0 var(--r-1) var(--r-1) 0;
	}
	a[aria-current='page'] {
		background: var(--surface-3);
		color: var(--text);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
</style>
