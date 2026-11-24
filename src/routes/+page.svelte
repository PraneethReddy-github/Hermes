<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { calHref } from '../lib/calendar';
	import MultiDayView from '#lib/components/calendar/MultiDayView.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import DueSection from '#lib/components/today/DueSection.svelte';
	import EventsTimeline from '#lib/components/today/EventsTimeline.svelte';
	import SummaryStrip from '#lib/components/today/SummaryStrip.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import { localDayKey } from '../lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const STALE_MS = 5 * 60_000;
	// svelte-ignore state_referenced_locally
	let nowMs = $state(Date.parse(data.now));
	let wide = $state(false);
	const loadedAt = $derived(Date.parse(data.now));
	const empty = $derived(
		!data.events.length && !data.overdue.length && !data.dueToday.length && !data.dueSoon.length
	);
	const dayHref = $derived(resolve(calHref('day', data.today) as '/calendar'));

	onMount(() => {
		const mq = matchMedia('(min-width: 1024px)');
		wide = mq.matches;
		const onMq = () => (wide = mq.matches);
		mq.addEventListener('change', onMq);
		const tick = setInterval(() => (nowMs = Date.now()), 30_000);
		// A PWA left open overnight: reload when it comes back after >5 min or on a new local day.
		const wake = () => {
			if (document.visibilityState !== 'visible') return;
			nowMs = Date.now();
			const day = localDayKey(new Date(nowMs).toISOString(), data.timeZone);
			if (nowMs - loadedAt > STALE_MS || day !== data.today) void invalidateAll();
		};
		document.addEventListener('visibilitychange', wake);
		window.addEventListener('focus', wake);
		return () => {
			mq.removeEventListener('change', onMq);
			clearInterval(tick);
			document.removeEventListener('visibilitychange', wake);
			window.removeEventListener('focus', wake);
		};
	});
</script>

<svelte:head><title>Today · Hermes</title></svelte:head>

<main class:wide>
	<div class="left">
		<TopBar title="Today" />
		<p class="date">{data.dateLabel}</p>
		<EventsTimeline events={data.events} today={data.today} tz={data.timeZone} {nowMs} />
		<DueSection title="Overdue" tasks={data.overdue} ctx={data} danger />
		<DueSection title="Due today" tasks={data.dueToday} ctx={data} />
		<DueSection title="Due soon" tasks={data.dueSoon} ctx={data} />
		{#if empty}<EmptyState title="Nothing due. Capture something with +" />{/if}
		<SummaryStrip
			shoppingId={data.shoppingId}
			shoppingOpen={data.shoppingOpen}
			notes={data.pinnedNotes}
		/>
	</div>
	{#if wide}
		<div class="right">
			<MultiDayView
				days={[data.today]}
				today={data.today}
				tz={data.timeZone}
				{nowMs}
				occurrences={data.events}
				tasks={[...data.overdue, ...data.dueToday]}
				onopen={() => goto(dayHref)}
				onopentask={() => goto(dayHref)}
			/>
		</div>
	{/if}
</main>

<style>
	.date {
		margin: 0 0 8px;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	@media (min-width: 1024px) {
		main.wide {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 24px;
			max-width: 1100px;
		}
		.right {
			display: flex;
			flex-direction: column;
			position: sticky;
			top: 16px;
			height: calc(100dvh - 32px);
		}
	}
</style>
