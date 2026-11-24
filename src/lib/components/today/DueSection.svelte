<script lang="ts">
	import type { Task } from '../../server/services/tasks';
	import { pending } from '../../stores/tasks.svelte';
	import TaskList from '../tasks/TaskList.svelte';

	let {
		title,
		tasks,
		ctx,
		danger = false
	}: {
		title: string;
		tasks: Task[];
		ctx: {
			timeZone: string;
			now: string;
			projects: { id: string; name: string }[];
			labelNames: string[];
		};
		danger?: boolean;
	} = $props();

	// Completed rows leave at once (optimistic), so the count and the heading follow.
	const count = $derived(tasks.filter((t) => !pending.has(t.id)).length);
</script>

{#if count}
	<section>
		<h2 class="caps" class:danger>{title} <span class="mono">{count}</span></h2>
		<TaskList groups={[{ tasks }]} {ctx} showProject emptyTitle="" />
	</section>
{/if}

<style>
	h2 {
		margin: 24px 0 4px;
	}
	h2.danger {
		color: var(--danger);
	}
	h2 span {
		font-weight: 500;
	}
</style>
