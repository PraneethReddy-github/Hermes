<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { Task } from '../../server/services/tasks';
	import { optimistic } from '../../stores/tasks.svelte';
	import Sheet from '../Sheet.svelte';

	let { task, onclose }: { task: Task; onclose: () => void } = $props();

	const submit: SubmitFunction = (input) =>
		optimistic(task.id, { hide: true, message: 'Rescheduled', onStart: onclose })(input);
</script>

<Sheet open title="Reschedule" {onclose}>
	<p class="what">{task.title}</p>
	<form method="POST" action="/tasks/{task.id}?/reschedule" use:enhance={submit}>
		<div class="quick">
			<button class="ghost" name="to" value="today">Today</button>
			<button class="ghost" name="to" value="tomorrow">Tomorrow</button>
			<button class="ghost" name="to" value="next_week">Next week</button>
		</div>
	</form>
	<form method="POST" action="/tasks/{task.id}?/reschedule" use:enhance={submit}>
		<label>Pick a date <input type="date" name="to" required /></label>
		<button>Set date</button>
	</form>
</Sheet>

<style>
	.what {
		margin: 0 0 12px;
		color: var(--text-muted);
	}
	.quick {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin-bottom: 16px;
	}
</style>
