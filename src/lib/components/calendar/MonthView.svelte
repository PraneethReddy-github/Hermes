<script lang="ts">
	import { resolve } from '$app/paths';
	import { calHref, dayNum, monthName, segmentOn, weekdayShort } from '../../calendar';
	import type { Task } from '../../server/services/tasks';
	import { localDayKey } from '../../time';
	import type { EventOccurrence } from '../../types';

	let {
		days,
		month,
		today,
		tz,
		occurrences,
		tasks
	}: {
		days: string[];
		/** Any day of the month on show; other days are muted. */
		month: string;
		today: string;
		tz: string;
		occurrences: EventOccurrence[];
		tasks: Task[];
	} = $props();

	const MAX_DOTS = 3;
	const cells = $derived(
		days.map((day) => {
			const events = occurrences.filter((o) => segmentOn(day, o, tz)).length;
			const due = tasks.filter((t) => localDayKey(t.dueAt!, tz) === day).length;
			const dots = [...Array<'event'>(events).fill('event'), ...Array<'task'>(due).fill('task')];
			return { day, events, due, dots: dots.slice(0, MAX_DOTS), extra: dots.length - MAX_DOTS };
		})
	);
	const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
</script>

<div class="month" role="group" aria-label="Month">
	{#each days.slice(0, 7) as d (d)}
		<span class="wd" aria-hidden="true">{weekdayShort(d)}</span>
	{/each}
	{#each cells as c (c.day)}
		<a
			href={resolve(calHref('agenda', c.day) as '/calendar')}
			data-day={c.day}
			class:muted={c.day.slice(0, 7) !== month.slice(0, 7)}
			class:today={c.day === today}
			aria-label="{weekdayShort(c.day)} {dayNum(c.day)} {monthName(c.day)}, {plural(
				c.events,
				'event'
			)}, {plural(c.due, 'task')}"
		>
			<span class="n">{dayNum(c.day)}</span>
			<span class="dots" aria-hidden="true">
				{#each c.dots as kind, i (i)}<span class="dot {kind}"></span>{/each}
				{#if c.extra > 0}<span class="more">+{c.extra}</span>{/if}
			</span>
		</a>
	{/each}
</div>

<style>
	.month {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 1px;
		background: var(--border);
		border: 1px solid var(--border);
		border-radius: var(--r-1);
		overflow: hidden;
	}
	.wd {
		padding: 6px 0;
		background: var(--surface);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: center;
	}
	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		min-height: 56px;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		padding: 6px 2px;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
	}
	a.muted {
		background: var(--bg);
		color: var(--text-muted);
	}
	a.today .n {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		margin: -3px 0;
		border: 1.5px solid var(--accent);
		border-radius: var(--r-1);
		color: var(--accent);
		font-weight: 600;
	}
	.dots {
		display: flex;
		align-items: center;
		gap: 3px;
		min-height: 8px;
	}
	.dot {
		box-sizing: border-box;
		width: 5px;
		height: 5px;
		border-radius: var(--r-1);
	}
	.event {
		background: var(--info);
	}
	.task {
		border: 1px solid var(--text-muted);
	}
	.more {
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
	}
</style>
