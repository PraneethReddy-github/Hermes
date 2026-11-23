<script lang="ts">
	import { onMount } from 'svelte';
	import {
		HOUR_PX,
		dayNum,
		layoutLanes,
		minutesOfDay,
		segmentOn,
		weekdayShort
	} from '../../calendar';
	import type { Task } from '../../server/services/tasks';
	import { localDayKey } from '../../time';
	import type { EventOccurrence } from '../../types';
	import EventBlock from './EventBlock.svelte';
	import TaskChip from './TaskChip.svelte';

	/** Day, 3-day and week: one hour grid (00:00–24:00) with an all-day strip on top. */
	let {
		days,
		today,
		tz,
		nowMs,
		occurrences,
		tasks,
		onopen,
		onopentask,
		onmove
	}: {
		days: string[];
		today: string;
		tz: string;
		nowMs: number;
		occurrences: EventOccurrence[];
		tasks: Task[];
		onopen: (o: EventOccurrence) => void;
		onopentask: (t: Task) => void;
		onmove?: (o: EventOccurrence, startAt: string, endAt: string) => Promise<void>;
	} = $props();

	let scroller: HTMLElement;
	const nowIso = $derived(new Date(nowMs).toISOString());
	const nowMin = $derived(minutesOfDay(nowIso, tz));

	const cols = $derived(
		days.map((day) => {
			const evs = occurrences.flatMap((occ) => {
				const seg = segmentOn(day, occ, tz);
				return seg ? [{ occ, ...seg }] : [];
			});
			const due = tasks.filter((t) => localDayKey(t.dueAt!, tz) === day);
			const timed = due
				.filter((t) => t.dueHasTime)
				.map((task) => {
					const startMin = Math.min(minutesOfDay(task.dueAt!, tz), 1410);
					return { task, startMin, endMin: startMin + 30 };
				});
			return {
				day,
				strip: { events: evs.filter((e) => e.allDay), tasks: due.filter((t) => !t.dueHasTime) },
				events: layoutLanes(evs.filter((e) => !e.allDay)),
				tasks: layoutLanes(timed)
			};
		})
	);

	// Open at 06:00, or an hour before now when today is on screen.
	onMount(() => {
		const min = days.includes(today) ? Math.max(0, nowMin - 60) : 360;
		scroller.scrollTop = (min / 60) * HOUR_PX;
	});
</script>

<div class="scroller" bind:this={scroller} style:--n={days.length} style:--hour="{HOUR_PX}px">
	<div class="sticky">
		<div class="row heads">
			<div></div>
			{#each cols as c (c.day)}
				<div class="head" class:today={c.day === today}>
					{weekdayShort(c.day)} <b>{dayNum(c.day)}</b>
				</div>
			{/each}
		</div>
		<div class="row strip" role="group" aria-label="All day">
			<div class="gutter">all-day</div>
			{#each cols as c (c.day)}
				<div class="cell" data-day={c.day}>
					{#each c.strip.events as e (e.occ.eventId + e.occ.originalStart)}
						<EventBlock occ={e.occ} {tz} {onopen} />
					{/each}
					{#each c.strip.tasks as t (t.id)}
						<TaskChip task={t} {tz} onopen={onopentask} />
					{/each}
				</div>
			{/each}
		</div>
	</div>
	<div class="row body">
		<div class="hours" aria-hidden="true">
			{#each Array.from({ length: 24 }, (_, i) => i) as h (h)}
				<span style:top="{h * HOUR_PX}px">{String(h).padStart(2, '0')}:00</span>
			{/each}
		</div>
		{#each cols as c (c.day)}
			<div class="col" class:today={c.day === today} data-day={c.day}>
				{#each c.events as e (e.occ.eventId + e.occ.originalStart)}
					<EventBlock occ={e.occ} {tz} seg={e} {onopen} onchange={onmove} />
				{/each}
				{#each c.tasks as t (t.task.id)}
					<TaskChip
						task={t.task}
						{tz}
						onopen={onopentask}
						style="position:absolute;top:{(t.startMin / 60) * HOUR_PX}px;left:{(t.lane / t.lanes) *
							100}%;width:calc({100 / t.lanes}% - 2px);height:{HOUR_PX / 2}px"
					/>
				{/each}
				{#if c.day === today}
					<div class="now" style:top="{(nowMin / 60) * HOUR_PX}px" aria-hidden="true"></div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.scroller {
		scroll-padding-top: 72px; /* the sticky head + all-day strip */
		flex: 1;
		min-height: 0;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
	}
	.row {
		display: grid;
		grid-template-columns: 48px repeat(var(--n), minmax(0, 1fr));
	}
	.sticky {
		position: sticky;
		top: 0;
		z-index: 5;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.head {
		padding: 6px 0;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.head.today {
		color: var(--accent);
	}
	.gutter {
		padding: 6px 4px;
		color: var(--text-muted);
		font-size: 0.6875rem;
	}
	.cell {
		display: grid;
		align-content: start;
		gap: 2px;
		min-width: 0;
		padding: 2px 1px 4px;
		border-left: 1px solid var(--border);
	}
	.hours {
		position: relative;
		height: calc(24 * var(--hour));
	}
	.hours span {
		position: absolute;
		right: 6px;
		transform: translateY(-50%);
		color: var(--text-muted);
		font-size: 0.6875rem;
	}
	.hours span:first-child {
		transform: none;
	}
	.col {
		position: relative;
		height: calc(24 * var(--hour));
		border-left: 1px solid var(--border);
		background: repeating-linear-gradient(
			to bottom,
			var(--border) 0 1px,
			transparent 1px var(--hour)
		);
	}
	.col.today {
		background-color: color-mix(in srgb, var(--accent) 6%, transparent);
	}
	.now {
		position: absolute;
		inset: 0 0 auto 0;
		height: 2px;
		background: var(--accent);
		z-index: 4;
		pointer-events: none;
	}
</style>
