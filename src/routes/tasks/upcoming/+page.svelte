<script lang="ts">
	import { resolve } from '$app/paths';
	import TopBar from '#lib/components/TopBar.svelte';
	import QuickAddInput from '#lib/components/tasks/QuickAddInput.svelte';
	import TaskList from '#lib/components/tasks/TaskList.svelte';
	import TaskTabs from '#lib/components/tasks/TaskTabs.svelte';
	import { formatDay } from '../../../lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Upcoming · Hermes</title></svelte:head>

<main>
	<TopBar title="Tasks" />
	<TaskTabs />
	<QuickAddInput projectNames={data.projects.map((p) => p.name)} timeZone={data.timeZone} />
	<TaskList
		groups={data.groups.map((g) => ({ title: formatDay(g.day, data.today), tasks: g.tasks }))}
		ctx={data}
		showProject
		emptyTitle="Nothing coming up"
		emptyHint="Nothing is due in the next 14 days."
	/>
	<p><a href={resolve('/tasks/completed')}>Completed</a></p>
</main>
