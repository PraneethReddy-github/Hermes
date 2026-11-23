<script lang="ts">
	import { resolve } from '$app/paths';
	import { calHref } from '../../calendar';
	import { localDayKey, localTime } from '../../time';
	import type { EventOccurrence } from '../../types';

	let {
		events,
		today,
		tz,
		nowMs
	}: { events: EventOccurrence[]; today: string; tz: string; nowMs: number } = $props();

	const allDay = $derived(events.filter((e) => e.allDay));
	const timed = $derived(
		events.filter((e) => !e.allDay).sort((a, b) => (a.startAt < b.startAt ? -1 : 1))
	);
	const href = $derived(resolve(calHref('day', today) as '/calendar'));
	// A timed event that began on an earlier day is shown from midnight.
	const start = (e: EventOccurrence) =>
		localDayKey(e.startAt, tz) < today ? '00:00' : localTime(e.startAt, tz);
</script>

{#if events.length}
	<section>
		<h2>Events</h2>
		{#if allDay.length}
			<div class="chips">
				{#each allDay as e (e.eventId + e.originalStart)}
					<a class="chip" {href} style:--c={e.color ?? 'var(--info)'}>{e.title}</a>
				{/each}
			</div>
		{/if}
		<ul>
			{#each timed as e (e.eventId + e.originalStart)}
				<li>
					<a {href} class:past={Date.parse(e.endAt) <= nowMs} style:--c={e.color ?? 'var(--info)'}>
						<time>{start(e)}</time>
						<span class="title">{e.title}</span>
						{#if e.location}<span class="loc">{e.location}</span>{/if}
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	h2 {
		margin: 16px 0 8px;
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 600;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 8px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		box-sizing: border-box;
		padding: 0 12px;
		border-radius: 22px;
		background: var(--c);
		color: var(--accent-ink);
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
	}
	li a {
		display: flex;
		align-items: baseline;
		gap: 12px;
		min-height: 44px;
		box-sizing: border-box;
		padding: 8px 12px;
		margin-bottom: 4px;
		border-left: 4px solid var(--c);
		border-radius: 6px;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
	}
	li a.past {
		opacity: 0.5;
	}
	time {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.title {
		flex: 1;
		min-width: 0;
		font-weight: 600;
	}
	.loc {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
</style>
