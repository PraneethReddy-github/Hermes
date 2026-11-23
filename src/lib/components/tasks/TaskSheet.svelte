<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { Task } from '../../server/services/tasks';
	import { errorOf, optimistic } from '../../stores/tasks.svelte';
	import { localDayKey, localTime } from '../../time';
	import Sheet from '../Sheet.svelte';
	import CheckButton from './CheckButton.svelte';

	let {
		task,
		timeZone,
		projects,
		labelNames,
		onclose
	}: {
		task: Task;
		timeZone: string;
		projects: { id: string; name: string }[];
		labelNames: string[];
		onclose: () => void;
	} = $props();

	const PRESETS = ['FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=YEARLY'];
	const REPEATS = [
		['', 'None'],
		['FREQ=DAILY', 'Daily'],
		['FREQ=WEEKLY', 'Weekly'],
		['FREQ=MONTHLY', 'Monthly'],
		['FREQ=YEARLY', 'Yearly'],
		['custom', 'Custom']
	];
	const PRIORITIES = ['None', 'Low', 'Medium', 'High', 'Urgent'];

	// Typed values stay across list reloads (e.g. after adding a subtask); only these seed the form.
	// svelte-ignore state_referenced_locally
	let repeat = $state(task.rrule ? (PRESETS.includes(task.rrule) ? task.rrule : 'custom') : '');
	// svelte-ignore state_referenced_locally
	let custom = $state(task.rrule ?? '');
	let error = $state('');
	let saving = $state(false);

	const dueDate = $derived(task.dueAt ? localDayKey(task.dueAt, timeZone) : '');
	const dueTime = $derived(task.dueAt && task.dueHasTime ? localTime(task.dueAt, timeZone) : '');
	const startDate = $derived(task.startAt ? localDayKey(task.startAt, timeZone) : '');
	const subtasks = $derived(task.subtasks ?? []);

	const save: SubmitFunction = () => {
		saving = true;
		error = '';
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') {
				onclose();
				await update({ reset: false, navigate: false });
			} else error = errorOf(result);
		};
	};
	const addSubtask: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type === 'success') await update({ navigate: false });
			else error = errorOf(result);
		};
	const toggleSubtask: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type === 'success') await update({ reset: false, navigate: false });
			else error = errorOf(result);
		};
</script>

<Sheet open title="Edit task" {onclose}>
	<form id="edit-{task.id}" method="POST" action="/tasks/{task.id}?/update" use:enhance={save}>
		<label>Title <input name="title" value={task.title} required maxlength="500" /></label>
		<label>Notes <textarea name="notes" value={task.notes}></textarea></label>
		<label>
			Project
			<select name="projectId">
				{#each projects as p (p.id)}
					<option value={p.id} selected={p.id === task.projectId}>{p.name}</option>
				{/each}
			</select>
		</label>
		<label>
			Labels
			<input
				name="labels"
				value={task.labels.map((l) => l.name).join(', ')}
				list="labels-{task.id}"
				placeholder="comma separated"
			/>
			<datalist id="labels-{task.id}">
				{#each labelNames as n (n)}<option value={n}></option>{/each}
			</datalist>
		</label>
		<label>
			Priority
			<select name="priority">
				{#each PRIORITIES as name, i (i)}
					<option value={i} selected={i === task.priority}>{name}</option>
				{/each}
			</select>
		</label>
		<div class="pair">
			<label>Due date <input type="date" name="dueDate" value={dueDate} /></label>
			<label>Due time <input type="time" name="dueTime" value={dueTime} /></label>
		</div>
		<div class="pair">
			<label>Start date <input type="date" name="startDate" value={startDate} /></label>
			<label>
				Estimate (min)
				<input type="number" name="estimate" min="1" step="1" value={task.estimateMin ?? ''} />
			</label>
		</div>
		<label>
			Repeat
			<select name="repeat" bind:value={repeat}>
				{#each REPEATS as [value, name] (value)}<option {value}>{name}</option>{/each}
			</select>
		</label>
		{#if repeat === 'custom'}
			<label>
				Custom rule
				<input name="rrule" bind:value={custom} placeholder="FREQ=WEEKLY;BYDAY=MO,WE" />
			</label>
		{/if}
	</form>

	<section>
		<h3>Subtasks</h3>
		{#if subtasks.length}
			<ul aria-label="Subtasks">
				{#each subtasks as s (s.id)}
					<li>
						<form
							method="POST"
							action="/tasks/{s.id}?/{s.completedAt ? 'uncomplete' : 'complete'}"
							use:enhance={toggleSubtask}
						>
							<CheckButton
								label="{s.completedAt ? 'Reopen' : 'Complete'} {s.title}"
								done={!!s.completedAt}
							/>
						</form>
						<span class:done={!!s.completedAt}>{s.title}</span>
					</li>
				{/each}
			</ul>
		{/if}
		<form method="POST" action="/tasks/{task.id}?/addSubtask" use:enhance={addSubtask}>
			<label>Add subtask <input name="title" autocomplete="off" enterkeyhint="done" /></label>
		</form>
	</section>

	{#if error}<p role="alert">{error}</p>{/if}
	<div class="actions">
		<button form="edit-{task.id}" disabled={saving}>Save</button>
		<form
			method="POST"
			action="/tasks/{task.id}?/delete"
			use:enhance={optimistic(task.id, {
				hide: true,
				message: 'Deleted',
				undo: `/tasks/${task.id}?/restore`,
				onStart: onclose
			})}
		>
			<button class="ghost danger">Delete</button>
		</form>
	</div>
</Sheet>

<style>
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	h3 {
		margin: 8px 0 0;
		font-size: 1rem;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
	}
	.done {
		color: var(--text-muted);
		text-decoration: line-through;
	}
	.actions {
		display: flex;
		gap: 12px;
		margin-top: 8px;
	}
	.actions > button {
		flex: 1;
	}
	.danger {
		color: var(--danger);
		border-color: var(--danger);
	}
</style>
