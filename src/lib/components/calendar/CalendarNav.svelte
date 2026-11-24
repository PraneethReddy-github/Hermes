<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '../Icon.svelte';
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
		<Icon name="chevron-left" />
	</button>
	<button class="ghost icon" aria-label="Next" onclick={() => go(view, stepDate(view, date, 1))}>
		<Icon name="chevron-right" />
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
		display: grid;
		place-items: center;
		padding: 0;
	}
	.label {
		flex: 1;
		margin: 0;
		text-align: right;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-weight: 500;
	}
	.views {
		display: flex;
		margin-bottom: 12px;
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
		border: 1px solid var(--border-strong);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 500;
	}
	label + label .seg {
		margin-left: -1px;
	}
	label:first-child .seg {
		border-radius: var(--r-1) 0 0 var(--r-1);
	}
	label:last-child .seg {
		border-radius: 0 var(--r-1) var(--r-1) 0;
	}
	input:checked + .seg {
		background: var(--surface-3);
		color: var(--text);
		box-shadow: inset 0 -2px 0 var(--accent);
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
