<script lang="ts">
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import TaskTabs from '#lib/components/tasks/TaskTabs.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Projects · Hermes</title></svelte:head>

<main>
	<TopBar title="Tasks" />
	<TaskTabs />
	<p class="manage">
		<a href={resolve('/projects')}>Manage projects</a> ·
		<a href={resolve('/labels')}>Manage labels</a>
	</p>
	<ul aria-label="Projects">
		{#each data.projects as p (p.id)}
			<li><a href={resolve('/projects/[id]', { id: p.id })}>{p.name}</a></li>
		{/each}
	</ul>
	{#if data.labels.length}
		<h2 class="caps">Labels</h2>
		<ul aria-label="Labels">
			{#each data.labels as l (l.id)}
				<li><a href={resolve('/labels/[id]', { id: l.id })}>#{l.name}</a></li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.manage {
		margin: 0 0 8px;
	}
	ul {
		margin: 0 0 16px;
		padding: 0;
	}
	li {
		list-style: none;
		border-bottom: 1px solid var(--border);
	}
	a {
		display: flex;
		align-items: center;
		min-height: 48px;
		color: var(--text);
		text-decoration: none;
	}
</style>
