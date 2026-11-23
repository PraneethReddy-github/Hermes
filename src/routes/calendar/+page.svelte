<script lang="ts">
	import { deserialize } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { calHref, minutesOfDay, rangeLabel } from '../../lib/calendar';
	import AgendaView from '#lib/components/calendar/AgendaView.svelte';
	import CalendarNav from '#lib/components/calendar/CalendarNav.svelte';
	import EventSheet from '#lib/components/calendar/EventSheet.svelte';
	import MonthView from '#lib/components/calendar/MonthView.svelte';
	import MultiDayView from '#lib/components/calendar/MultiDayView.svelte';
	import ScopeDialog from '#lib/components/calendar/ScopeDialog.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import TaskSheet from '#lib/components/tasks/TaskSheet.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { errorOf } from '../../lib/stores/tasks.svelte';
	import { showToast } from '../../lib/stores/toast.svelte';
	import { addLocalDays, localDayKey, localTime } from '../../lib/time';
	import type { EventOccurrence, RecurrenceScope } from '../../lib/types';
	import type { Task } from '../../lib/server/services/tasks';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Sheet = { occ?: EventOccurrence; scope: RecurrenceScope };
	let sheet = $state<Sheet | null>(null);
	let ask = $state<{
		title: string;
		run: (s: RecurrenceScope) => void;
		cancel?: () => void;
	} | null>(null);
	let taskId = $state<string | null>(null);
	// svelte-ignore state_referenced_locally
	let nowMs = $state(Date.parse(data.now));

	const grid = $derived(['day', '3day', 'week'].includes(data.view));
	const editing = $derived(data.tasks.find((t) => t.id === taskId));

	onMount(() => {
		// No view in the URL: phones get the agenda (the server default), desktops the week.
		if (!page.url.searchParams.has('view') && matchMedia('(min-width: 1024px)').matches)
			void goto(resolve(calHref('week', data.date) as '/calendar'), {
				replace: true,
				reset: false
			});
		const t = setInterval(() => (nowMs = Date.now()), 30_000);
		return () => clearInterval(t);
	});

	/** Day + next full hour (1 h long) for a new event on the selected day. */
	function newEvent() {
		const hour = Math.min(
			23,
			Math.floor(minutesOfDay(new Date(nowMs).toISOString(), data.timeZone) / 60) + 1
		);
		const pad = (n: number) => `${String(n).padStart(2, '0')}:00`;
		const day = data.date;
		return {
			day,
			time: pad(hour),
			endDay: hour === 23 ? addLocalDays(day, 1) : day,
			endTime: pad((hour + 1) % 24)
		};
	}
	let start = $state(newEvent());

	/** A recurring occurrence asks "this / following / all" before it opens. */
	function open(occ: EventOccurrence) {
		if (occ.isRecurring)
			ask = {
				title: 'Edit recurring event',
				run: (scope) => {
					ask = null;
					sheet = { occ, scope };
				}
			};
		else sheet = { occ, scope: 'all' };
	}

	async function submitMove(
		occ: EventOccurrence,
		startAt: string,
		endAt: string,
		scope: RecurrenceScope
	) {
		const tz = data.timeZone;
		const body = new FormData();
		const fields = {
			scope,
			originalStart: occ.originalStart,
			occurrenceStart: occ.startAt,
			startDate: localDayKey(startAt, tz),
			startTime: localTime(startAt, tz),
			endDate: localDayKey(endAt, tz),
			endTime: localTime(endAt, tz)
		};
		for (const [k, v] of Object.entries(fields)) body.set(k, v);
		try {
			// accept json: an expired session then gets a 401 instead of a redirect to the login page
			const res = await fetch(`/calendar/events/${occ.eventId}?/update`, {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
			});
			// signed out: a full navigation to the login page, which brings the user back here
			if (res.status === 401) return location.assign(`/login?next=${page.url.pathname}`);
			const result = deserialize(await res.text());
			if (result.type === 'success') await invalidateAll();
			else showToast(errorOf(result), { error: true });
		} catch {
			showToast('Could not move the event. Check your connection and try again.', {
				error: true
			});
		}
	}

	function move(occ: EventOccurrence, startAt: string, endAt: string): Promise<void> {
		if (!occ.isRecurring) return submitMove(occ, startAt, endAt, 'all');
		return new Promise((done) => {
			ask = {
				title: 'Move recurring event',
				run: (scope) => {
					ask = null;
					void submitMove(occ, startAt, endAt, scope).then(done);
				},
				cancel: done
			};
		});
	}
</script>

<svelte:head><title>Calendar · Hermes</title></svelte:head>

<main class="cal" class:stage={grid}>
	<TopBar title="Calendar" />
	<CalendarNav
		view={data.view}
		date={data.date}
		today={data.today}
		label={rangeLabel(data.view, data.date, data.days)}
	/>
	{#key `${data.view}-${data.date}`}
		{#if data.view === 'agenda'}
			<AgendaView
				days={data.days}
				date={data.date}
				today={data.today}
				tz={data.timeZone}
				occurrences={data.occurrences}
				tasks={data.tasks}
				onopen={open}
				onopentask={(t: Task) => (taskId = t.id)}
			/>
		{:else if data.view === 'month'}
			<MonthView
				days={data.days}
				month={data.date}
				today={data.today}
				tz={data.timeZone}
				occurrences={data.occurrences}
				tasks={data.tasks}
			/>
		{:else}
			<MultiDayView
				days={data.days}
				today={data.today}
				tz={data.timeZone}
				{nowMs}
				occurrences={data.occurrences}
				tasks={data.tasks}
				onopen={open}
				onopentask={(t: Task) => (taskId = t.id)}
				onmove={move}
			/>
		{/if}
	{/key}
</main>

<button
	class="fab"
	aria-label="New event"
	onclick={() => {
		start = newEvent();
		sheet = { scope: 'all' };
	}}
>
	<Icon name="plus" /> Event
</button>

{#if sheet}
	{#key sheet.occ?.eventId + (sheet.occ?.originalStart ?? '') + sheet.scope}
		<EventSheet
			occ={sheet.occ}
			scope={sheet.scope}
			details={sheet.occ && data.details[sheet.occ.eventId]}
			tz={data.timeZone}
			{start}
			onclose={() => (sheet = null)}
		/>
	{/key}
{/if}
{#if ask}
	<ScopeDialog
		title={ask.title}
		onpick={ask.run}
		onclose={() => {
			ask?.cancel?.();
			ask = null;
		}}
	/>
{/if}
{#if editing}
	{#key editing.id}
		<TaskSheet
			task={editing}
			timeZone={data.timeZone}
			projects={data.projects}
			labelNames={data.labelNames}
			onclose={() => (taskId = null)}
		/>
	{/key}
{/if}

<style>
	.cal {
		max-width: 1100px;
	}
	/* Grid views scroll inside the page, so the sticky day heads stay put. */
	.stage {
		display: flex;
		flex-direction: column;
		width: 100%;
		box-sizing: border-box;
		height: calc(100dvh - 72px - env(safe-area-inset-bottom));
	}
	.fab {
		position: fixed;
		right: max(16px, env(safe-area-inset-right));
		bottom: calc(72px + 16px + env(safe-area-inset-bottom));
		z-index: 9;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 20px 0 12px;
		border-radius: 24px;
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.35);
	}
	@media (min-width: 1024px) {
		.stage {
			height: 100dvh;
		}
		.fab {
			bottom: 24px;
			right: 24px;
		}
	}
</style>
