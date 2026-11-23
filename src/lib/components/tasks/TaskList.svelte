<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { Task } from '../../server/services/tasks';
	import { pending } from '../../stores/tasks.svelte';
	import EmptyState from '../EmptyState.svelte';
	import RescheduleSheet from './RescheduleSheet.svelte';
	import TaskRow from './TaskRow.svelte';
	import TaskSheet from './TaskSheet.svelte';

	let {
		groups,
		ctx,
		emptyTitle,
		emptyHint,
		showProject = false,
		reorderable = false
	}: {
		groups: { title?: string; tasks: Task[] }[];
		ctx: {
			timeZone: string;
			now: string;
			projects: { id: string; name: string }[];
			labelNames: string[];
		};
		emptyTitle: string;
		emptyHint?: string;
		showProject?: boolean;
		/** Desktop drag-to-reorder; the list is a single project (`?/reorder` on the page). */
		reorderable?: boolean;
	} = $props();

	let editId = $state<string | null>(null);
	let moveId = $state<string | null>(null);
	let order = $state<string[] | null>(null);
	let dragTask: Task | null = null;
	let reorderForm: HTMLFormElement | undefined = $state();

	const shown = $derived(
		groups
			.map((g) => ({ ...g, tasks: g.tasks.filter((t) => !pending.has(t.id)) }))
			.filter((g) => g.tasks.length)
	);
	const all = $derived(groups.flatMap((g) => g.tasks));
	const editing = $derived(all.find((t) => t.id === editId));
	const moving = $derived(all.find((t) => t.id === moveId));
	const projectName = (t: Task) => ctx.projects.find((p) => p.id === t.projectId)?.name;
	const inOrder = (tasks: Task[]) =>
		order ? [...tasks].sort((a, b) => order!.indexOf(a.id) - order!.indexOf(b.id)) : tasks;

	// Pointer-fine only: phones have no HTML5 drag.
	const canDrag = $derived(
		reorderable && typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches
	);
	// The server sorts by due, then priority, then position: only rows tied on the first two can swap.
	const sameGroup = (a: Task, b: Task) => a.dueAt === b.dueAt && a.priority === b.priority;
	const canDrop = (target: Task) =>
		!!dragTask && dragTask !== target && sameGroup(dragTask, target);
	async function drop(target: Task, tasks: Task[]) {
		const dragged = dragTask;
		dragTask = null;
		if (!dragged || dragged.id === target.id || !sameGroup(dragged, target)) return;
		const ids = tasks.map((t) => t.id).filter((id) => id !== dragged.id);
		ids.splice(ids.indexOf(target.id), 0, dragged.id);
		order = ids;
		await tick(); // the hidden input must carry the new order before submit
		reorderForm?.requestSubmit();
	}
</script>

{#each shown as g, gi (g.title ?? gi)}
	<section aria-label={g.title}>
		{#if g.title}<h2>{g.title}</h2>{/if}
		<ul aria-label="Tasks">
			{#each inOrder(g.tasks) as t (t.id)}
				<TaskRow
					task={t}
					timeZone={ctx.timeZone}
					now={ctx.now}
					projectName={showProject ? projectName(t) : undefined}
					onopen={(x: Task) => (editId = x.id)}
					onreschedule={(x: Task) => (moveId = x.id)}
					draggable={canDrag}
					ondragstart={() => (dragTask = t)}
					ondragover={(e: DragEvent) => canDrag && canDrop(t) && e.preventDefault()}
					ondrop={() => drop(t, g.tasks)}
				/>
			{/each}
		</ul>
	</section>
{:else}
	<EmptyState title={emptyTitle} hint={emptyHint} />
{/each}

{#if reorderable}
	<form
		bind:this={reorderForm}
		method="POST"
		action="?/reorder"
		use:enhance={() =>
			async ({ update }) => {
				await update({ reset: false, navigate: false });
				order = null;
			}}
	>
		<input type="hidden" name="ids" value={order?.join(',') ?? ''} />
	</form>
{/if}

{#if editing}
	{#key editing.id}
		<TaskSheet
			task={editing}
			timeZone={ctx.timeZone}
			projects={ctx.projects}
			labelNames={ctx.labelNames}
			onclose={() => (editId = null)}
		/>
	{/key}
{/if}
{#if moving}
	<RescheduleSheet task={moving} onclose={() => (moveId = null)} />
{/if}

<style>
	section {
		margin-bottom: 16px;
	}
	h2 {
		margin: 16px 0 4px;
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 600;
	}
	ul {
		margin: 0;
		padding: 0;
	}
</style>
