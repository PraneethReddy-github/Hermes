<script lang="ts">
	import { enhance } from '$app/forms';
	import type { HTMLLiAttributes } from 'svelte/elements';
	import { swipe } from '../../actions/swipe';
	import type { Task } from '../../server/services/tasks';
	import { optimistic } from '../../stores/tasks.svelte';
	import { formatDue } from '../../time';
	import Icon from '../Icon.svelte';
	import CheckButton from './CheckButton.svelte';
	import PriorityDot from './PriorityDot.svelte';

	let {
		task,
		timeZone,
		now,
		projectName,
		onopen,
		onreschedule,
		...rest
	}: {
		task: Task;
		timeZone: string;
		now: string;
		projectName?: string;
		onopen: (t: Task) => void;
		onreschedule: (t: Task) => void;
	} & HTMLLiAttributes = $props();

	let form: HTMLFormElement;
	const due = $derived(task.dueAt ? formatDue(task.dueAt, task.dueHasTime, timeZone, now) : '');
	const overdue = $derived(!!task.dueAt && task.dueAt < now);
	const subs = $derived(task.subtasks ?? []);
	const meta = $derived(
		[projectName, ...task.labels.map((l) => `#${l.name}`)].filter(Boolean).join(' · ')
	);
</script>

<li
	{...rest}
	data-task-id={task.id}
	use:swipe={{
		onRight: () => form.requestSubmit(),
		onLeft: () => onreschedule(task),
		threshold: 80
	}}
>
	<div class="bg ok" aria-hidden="true"><Icon name="check" /></div>
	<div class="bg gold" aria-hidden="true"><Icon name="clock" /></div>
	<div class="fg">
		<form
			bind:this={form}
			method="POST"
			action="/tasks/{task.id}?/complete"
			use:enhance={optimistic(task.id, {
				hide: true,
				message: 'Completed',
				undo: `/tasks/${task.id}?/uncomplete`
			})}
		>
			<CheckButton label="Complete {task.title}" />
		</form>
		<div class="main">
			<button class="title" data-focus onclick={() => onopen(task)}>{task.title}</button>
			<p class="meta">
				{#if due}<span class:overdue>{due}</span>{/if}
				{#if subs.length}<span>{subs.filter((s) => s.completedAt).length}/{subs.length}</span>{/if}
				{#if meta}<span>{meta}</span>{/if}
			</p>
		</div>
		<PriorityDot priority={task.priority} />
		<button class="clock" aria-label="Reschedule {task.title}" onclick={() => onreschedule(task)}>
			<Icon name="clock" />
		</button>
	</div>
</li>

<style>
	li {
		position: relative;
		overflow: hidden;
		list-style: none;
		border-bottom: 1px solid var(--border);
	}
	.bg {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		padding: 0 20px;
		opacity: 0;
		color: var(--accent-ink);
	}
	.ok {
		background: var(--ok);
	}
	.gold {
		justify-content: flex-end;
		background: var(--accent);
	}
	li[data-swipe='right'] .ok,
	li[data-swipe='left'] .gold {
		opacity: 1;
	}
	.fg {
		position: relative;
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 56px;
		background: var(--bg);
		transform: translateX(var(--dx, 0px));
		transition: transform 150ms ease-out;
	}
	li[data-dragging] .fg {
		transition: none;
	}
	form {
		display: contents;
	}
	.main {
		flex: 1;
		min-width: 0;
		padding: 6px 0;
	}
	.title {
		display: block;
		width: 100%;
		min-height: 0;
		padding: 0;
		background: none;
		border: 0;
		color: var(--text);
		font-weight: 500;
		text-align: left;
		overflow-wrap: anywhere;
	}
	/* The whole row is the tap target; the check and clock buttons sit above it. */
	.title::after {
		content: '';
		position: absolute;
		inset: 0;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		margin: 0;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.meta:empty {
		display: none;
	}
	.overdue {
		color: var(--danger);
	}
	.clock {
		position: relative;
		z-index: 1;
		display: none;
		place-items: center;
		width: 44px;
		padding: 0;
		background: none;
		border: 0;
		color: var(--text-muted);
	}
	/* Touch has swipe; a mouse gets a button. */
	@media (pointer: fine) {
		.clock {
			display: grid;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fg {
			transition: none;
		}
	}
</style>
