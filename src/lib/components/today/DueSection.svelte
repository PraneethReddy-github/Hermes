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
		<h2 class:danger>{title} <span>{count}</span></h2>
		<TaskList groups={[{ tasks }]} {ctx} showProject emptyTitle="" />
	</section>
{/if}

<style>
	h2 {
		margin: 24px 0 4px;
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 600;
	}
	h2.danger {
		color: var(--danger);
	}
	h2 span {
		font-weight: 400;
	}
</style>
