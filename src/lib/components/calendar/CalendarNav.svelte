<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { VIEWS, calHref, stepDate, type View } from '../../calendar';

	let { view, date, today, label }: { view: View; date: string; today: string; label: string } =
		$props();

	const NAMES: Record<View, string> = {
		agenda: 'Agenda',
		day: 'Day',
		'3day': '3 days',
		week: 'Week',
		month: 'Month'
	};
	const go = (v: View, d: string) => goto(resolve(calHref(v, d) as '/calendar'), { reset: false });
</script>

<div class="nav">
	<button
		class="ghost icon"
		aria-label="Previous"
		onclick={() => go(view, stepDate(view, date, -1))}
	>
		<span aria-hidden="true">‹</span>
	</button>
	<button class="ghost icon" aria-label="Next" onclick={() => go(view, stepDate(view, date, 1))}>
		<span aria-hidden="true">›</span>
	</button>
	<button class="ghost" aria-label="Today" onclick={() => go(view, today)}>Today</button>
	<p class="label" aria-live="polite">{label}</p>
</div>

<div class="views" role="radiogroup" aria-label="Calendar view">
	{#each VIEWS as v (v)}
		<label class:week={v === 'week'}>
			<input type="radio" name="view" value={v} checked={v === view} onchange={() => go(v, date)} />
			<span class="seg">{NAMES[v]}</span>
		</label>
	{/each}
</div>

<style>
	.nav {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}
	.icon {
		width: 44px;
		padding: 0;
		font-size: 1.5rem;
		line-height: 1;
	}
	.label {
		flex: 1;
		margin: 0;
		text-align: right;
		font-weight: 600;
	}
	.views {
		display: flex;
		padding: 2px;
		margin-bottom: 12px;
		background: var(--surface-2);
		border-radius: 10px;
	}
	label {
		position: relative;
		flex: 1;
		margin: 0;
	}
	input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.seg {
		display: grid;
		place-items: center;
		min-height: 44px;
		border-radius: 8px;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	input:checked + .seg {
		background: var(--surface);
		color: var(--text);
		font-weight: 600;
	}
	input:focus-visible + .seg {
		outline: 2px solid var(--accent);
	}
	/* Week is a desktop view; phones still reach it by URL. */
	@media (max-width: 1023px) {
		.week {
			display: none;
		}
	}
</style>
