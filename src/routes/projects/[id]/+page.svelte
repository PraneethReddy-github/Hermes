<script lang="ts">
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import QuickAddInput from '#lib/components/tasks/QuickAddInput.svelte';
	import ChecklistView from '#lib/components/tasks/ChecklistView.svelte';
	import TaskList from '#lib/components/tasks/TaskList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.project.name} · Hermes</title></svelte:head>

<main>
	<TopBar title={data.project.name} />
	<p class="back"><a href={resolve('/projects')}>All projects</a></p>
	{#if data.project.kind === 'checklist'}
		<ChecklistView projectId={data.project.id} open={data.tasks} done={data.done} />
	{:else}
		<QuickAddInput
			projectNames={data.projects.map((p) => p.name)}
			timeZone={data.timeZone}
			defaultProjectId={data.project.id}
		/>
		<TaskList
			groups={[{ tasks: data.tasks }]}
			ctx={data}
			reorderable
			emptyTitle="No tasks here"
			emptyHint="Add one above."
		/>
		<p><a href={resolve('/tasks/completed')}>Completed</a></p>
	{/if}
</main>

<style>
	.back {
		margin: 0 0 8px;
	}
</style>
