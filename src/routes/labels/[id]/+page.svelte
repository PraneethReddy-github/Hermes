<script lang="ts">
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import TaskList from '#lib/components/tasks/TaskList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>#{data.label.name} · Hermes</title></svelte:head>

<main>
	<TopBar title="#{data.label.name}" />
	<p class="back"><a href={resolve('/tasks/projects')}>All projects and labels</a></p>
	<TaskList
		groups={[{ tasks: data.tasks }]}
		ctx={data}
		showProject
		emptyTitle="No tasks with this label"
	/>
</main>

<style>
	.back {
		margin: 0 0 8px;
	}
</style>
