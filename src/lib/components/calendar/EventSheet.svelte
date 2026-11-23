<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { localDayKey, localTime } from '../../time';
	import { errorOf } from '../../stores/tasks.svelte';
	import { showToast } from '../../stores/toast.svelte';
	import type { EventOccurrence, RecurrenceScope } from '../../types';
	import ColorSwatches from '../ColorSwatches.svelte';
	import Sheet from '../Sheet.svelte';

	/** A new event pre-filled with `start`/`end` (local day + HH:mm), or an existing occurrence. */
	let {
		occ,
		scope = 'all',
		details,
		tz,
		start,
		onclose
	}: {
		occ?: EventOccurrence;
		scope?: RecurrenceScope;
		details?: { notes: string; rrule: string | null };
		tz: string;
		start?: { day: string; time: string; endDay: string; endTime: string };
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
	const SCOPE_NOTE = {
		this: 'Only title, time and location can change for this event.',
		following: 'Changes apply to this and following events.',
		all: 'Changes apply to all events.'
	};

	const rrule = $derived(details?.rrule ?? null);
	// An all-day end is exclusive; the form shows the last day.
	const last = (iso: string) => localDayKey(new Date(Date.parse(iso) - 1).toISOString(), tz);
	const init = $derived(
		occ
			? {
					day: localDayKey(occ.startAt, tz),
					endDay: occ.allDay ? last(occ.endAt) : localDayKey(occ.endAt, tz),
					time: occ.allDay ? '09:00' : localTime(occ.startAt, tz),
					endTime: occ.allDay ? '10:00' : localTime(occ.endAt, tz)
				}
			: start!
	);

	// Typed values stay across list reloads; only these seed the form.
	// svelte-ignore state_referenced_locally
	let allDay = $state(occ?.allDay ?? false);
	// svelte-ignore state_referenced_locally
	let repeat = $state(rrule ? (PRESETS.includes(rrule) ? rrule : 'custom') : '');
	// svelte-ignore state_referenced_locally
	let custom = $state(rrule ?? '');
	let error = $state('');
	let saving = $state(false);
	let confirming = $state(false);

	const url = $derived(occ ? `/calendar/events/${occ.eventId}` : '/calendar');
	const recurring = $derived(!!occ?.isRecurring);
	const thisOnly = $derived(recurring && scope === 'this');

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
	const remove: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type === 'success') {
				onclose();
				showToast('Event deleted');
				await update({ reset: false, navigate: false });
			} else error = errorOf(result);
		};
</script>

<Sheet open title={occ ? 'Edit event' : 'New event'} {onclose}>
	<form
		id="event-form"
		method="POST"
		action="{url}?/{occ ? 'update' : 'create'}"
		use:enhance={save}
	>
		<input type="hidden" name="scope" value={scope} />
		{#if occ}
			<input type="hidden" name="originalStart" value={occ.originalStart} />
			<input type="hidden" name="occurrenceStart" value={occ.startAt} />
		{/if}
		{#if recurring}<p class="note">{SCOPE_NOTE[scope]}</p>{/if}
		<label>Title <input name="title" value={occ?.title ?? ''} required maxlength="200" /></label>
		<fieldset disabled={thisOnly}>
			<label class="check">
				<input type="checkbox" bind:checked={allDay} />
				All day
			</label>
			<input type="hidden" name="allDay" value={allDay ? '1' : '0'} />
		</fieldset>
		<div class="pair">
			<label>Start date <input type="date" name="startDate" value={init.day} required /></label>
			<label class:gone={allDay}>
				Start time <input type="time" name="startTime" value={init.time} />
			</label>
		</div>
		<div class="pair">
			<label>End date <input type="date" name="endDate" value={init.endDay} required /></label>
			<label class:gone={allDay}>
				End time <input type="time" name="endTime" value={init.endTime} />
			</label>
		</div>
		<label>Location <input name="location" value={occ?.location ?? ''} /></label>
		<fieldset disabled={thisOnly}>
			<label>Notes <textarea name="notes" value={details?.notes ?? ''}></textarea></label>
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
			<ColorSwatches none value={occ?.color ?? ''} />
		</fieldset>
	</form>

	{#if error}<p role="alert">{error}</p>{/if}
	<div class="actions">
		<button form="event-form" disabled={saving}>Save</button>
		{#if occ && recurring}
			<form method="POST" action="{url}?/delete" use:enhance={remove}>
				<input type="hidden" name="scope" value={scope} />
				<input type="hidden" name="originalStart" value={occ.originalStart} />
				<button class="ghost danger">Delete</button>
			</form>
		{:else if occ}
			<button class="ghost danger" type="button" onclick={() => (confirming = true)}>Delete</button>
		{/if}
	</div>
</Sheet>

{#if confirming && occ}
	<Sheet open title="Delete event?" onclose={() => (confirming = false)}>
		<p class="note">“{occ.title}” will be deleted.</p>
		<div class="actions">
			<form method="POST" action="{url}?/delete" use:enhance={remove}>
				<input type="hidden" name="scope" value="all" />
				<button class="ghost danger">Delete</button>
			</form>
			<button class="ghost" type="button" onclick={() => (confirming = false)}>Cancel</button>
		</div>
	</Sheet>
{/if}

<style>
	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	fieldset:disabled {
		opacity: 0.5;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		color: var(--text);
		font-size: 1rem;
	}
	.check input {
		width: 20px;
		height: 20px;
		margin: 0;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.note {
		margin: 0 0 12px;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.actions {
		display: flex;
		gap: 12px;
		margin-top: 8px;
	}
	.actions > * {
		flex: 1;
	}
	.actions form button {
		width: 100%;
	}
	.gone {
		display: none;
	}
	.danger {
		color: var(--danger);
		border-color: var(--danger);
	}
</style>
