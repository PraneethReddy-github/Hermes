<script lang="ts">
	import { resolve } from '$app/paths';
	import { MAX_AGENDA_DAYS, calHref, minutesOfDay, segmentOn } from '../../calendar';
	import type { Task } from '../../server/services/tasks';
	import { formatDay, localDayKey, localTime } from '../../time';
	import type { EventOccurrence } from '../../types';
	import EmptyState from '../EmptyState.svelte';
	import EventBlock from './EventBlock.svelte';
	import TaskChip from './TaskChip.svelte';

	let {
		days,
		date,
		today,
		tz,
		occurrences,
		tasks,
		onopen,
		onopentask
	}: {
		days: string[];
		date: string;
		today: string;
		tz: string;
		occurrences: EventOccurrence[];
		tasks: Task[];
		onopen: (o: EventOccurrence) => void;
		onopentask: (t: Task) => void;
	} = $props();

	type Item =
		| { key: string; at: number; label: string; occ: EventOccurrence }
		| { key: string; at: number; label: string; task: Task };

	// All-day events first, then timed events and tasks by time, all-day tasks last.
	const groups = $derived(
		days
			.map((day) => {
				const items: Item[] = [
					...occurrences.flatMap((occ) => {
						const s = segmentOn(day, occ, tz);
						if (!s) return [];
						const label = s.allDay
							? 'All day'
							: s.startsHere
								? localTime(occ.startAt, tz)
								: '00:00';
						return [
							{ key: occ.eventId + occ.originalStart, at: s.allDay ? -1 : s.startMin, label, occ }
						];
					}),
					...tasks
						.filter((t) => localDayKey(t.dueAt!, tz) === day)
						.map((task) => ({
							key: task.id,
							at: task.dueHasTime ? minutesOfDay(task.dueAt!, tz) : 1441,
							label: task.dueHasTime ? localTime(task.dueAt!, tz) : 'Due',
							task
						}))
				];
				return { day, items: items.sort((a, b) => a.at - b.at) };
			})
			.filter((g) => g.items.length || g.day === today)
	);
	const more = $derived(days.length < MAX_AGENDA_DAYS);
</script>

{#each groups as g (g.day)}
	<section aria-labelledby="d-{g.day}" data-day={g.day}>
		<h2 id="d-{g.day}" class="caps" class:today={g.day === today}>
			{g.day === today ? 'Today' : formatDay(g.day, today)}
		</h2>
		<ul>
			{#each g.items as it (it.key)}
				<li>
					<span class="at">{it.label}</span>
					{#if 'occ' in it}
						<EventBlock occ={it.occ} {tz} {onopen} />
					{:else}
						<TaskChip task={it.task} {tz} onopen={onopentask} />
					{/if}
				</li>
			{:else}
				<li class="none">Nothing scheduled</li>
			{/each}
		</ul>
	</section>
{:else}
	<EmptyState title="Nothing scheduled" hint="Add an event with the button below." />
{/each}

{#if days.length}
	<p class="more">
		{#if more}
			<a
				href={resolve(
					calHref('agenda', date, Math.min(MAX_AGENDA_DAYS, days.length + 14)) as '/calendar'
				)}
				data-sveltekit-reset="false"
			>
				Load more
			</a>
		{:else}
			<span>Showing {MAX_AGENDA_DAYS} days</span>
		{/if}
	</p>
{/if}

<style>
	section {
		margin-bottom: 8px;
	}
	h2 {
		position: sticky;
		top: 0;
		z-index: 2;
		margin: 0;
		padding: 8px 0 4px;
		background: var(--bg);
	}
	h2.today {
		color: var(--accent);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		grid-template-columns: 56px 1fr;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}
	.at {
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.none {
		display: block;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.more {
		text-align: center;
	}
	.more a {
		display: inline-grid;
		place-items: center;
		min-height: 44px;
		padding: 0 16px;
	}
	.more span {
		color: var(--text-muted);
	}
</style>
