<script lang="ts">
	import { localTime } from '../../time';
	import type { Task } from '../../server/services/tasks';
	import PriorityDot from '../tasks/PriorityDot.svelte';

	let {
		task,
		tz,
		style,
		onopen
	}: { task: Task; tz: string; style?: string; onopen: (t: Task) => void } = $props();

	const due = $derived(task.dueHasTime ? ` due ${localTime(task.dueAt!, tz)}` : '');
</script>

<button
	class="chip"
	class:flat={!!style}
	data-kind="task"
	aria-label="{task.title}, task{due}"
	{style}
	onclick={() => onopen(task)}
>
	<PriorityDot priority={task.priority} />
	<span>{task.title}</span>
</button>

<style>
	.chip {
		display: flex;
		align-items: center;
		gap: 6px;
		box-sizing: border-box;
		width: 100%;
		min-height: 44px;
		padding: 2px 8px;
		text-align: left;
		background: var(--surface);
		color: var(--text);
		border: 1.5px solid var(--accent);
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 400;
	}
	/* In the hour grid the chip is positioned by its parent and sized to its slot. */
	.flat {
		min-height: 0;
	}
	span:last-child {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
</style>
