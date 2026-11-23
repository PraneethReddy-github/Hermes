<script lang="ts">
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import QuickAddInput from '#lib/components/tasks/QuickAddInput.svelte';
	import TaskList from '#lib/components/tasks/TaskList.svelte';
	import TaskTabs from '#lib/components/tasks/TaskTabs.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Tasks · Hermes</title></svelte:head>

<main>
	<TopBar title="Tasks" />
	<TaskTabs />
	<QuickAddInput projectNames={data.projects.map((p) => p.name)} timeZone={data.timeZone} />
	<TaskList
		groups={[{ tasks: data.tasks }]}
		ctx={data}
		showProject
		emptyTitle="Nothing due"
		emptyHint="Add a task above, or check Upcoming."
	/>
	<p><a href={resolve('/tasks/completed')}>Completed</a></p>
</main>
