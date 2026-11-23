<script lang="ts">
	import { HOUR_PX, timeRange } from '../../calendar';
	import type { EventOccurrence } from '../../types';

	/** Snap and clamp work in minutes; the grid draws HOUR_PX per hour. */
	const SNAP = 15;

	let {
		occ,
		tz,
		seg,
		onopen,
		onchange
	}: {
		occ: EventOccurrence;
		tz: string;
		/** Set in the hour grid (absolute); without it the block is a plain full-width row. */
		seg?: {
			startMin: number;
			endMin: number;
			lane: number;
			lanes: number;
			startsHere: boolean;
			endsHere: boolean;
		};
		onopen: (o: EventOccurrence) => void;
		/** Drag result as new instants; resolves once the server has answered. */
		onchange?: (o: EventOccurrence, startAt: string, endAt: string) => Promise<void>;
	} = $props();

	const range = $derived(timeRange(occ, tz));
	// Mouse and pen only: touch scrolls the grid, and phones edit times in the sheet.
	const canDrag = $derived(
		!!seg &&
			!!onchange &&
			!occ.allDay &&
			typeof matchMedia !== 'undefined' &&
			matchMedia('(pointer: fine)').matches
	);

	let origin: { y: number; mode: 'move' | 'resize' } | null = null;
	let drag = $state<{ mode: 'move' | 'resize'; delta: number } | null>(null);
	let busy = $state(false);
	let dragged = false;

	const top = $derived(seg ? seg.startMin + (drag?.mode === 'move' ? drag.delta : 0) : 0);
	const bottom = $derived(
		seg ? seg.endMin + (drag ? drag.delta : 0) : 0 // a move shifts both edges, a resize only the end
	);

	function down(e: PointerEvent, mode: 'move' | 'resize') {
		if (!canDrag || busy || e.button !== 0 || e.pointerType === 'touch') return;
		if (mode === 'resize' && !seg!.endsHere) return;
		origin = { y: e.clientY, mode };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		if (mode === 'resize') e.stopPropagation(); // the grip sits inside the block
	}
	function move(e: PointerEvent) {
		if (!origin || !seg) return;
		const dy = e.clientY - origin.y;
		if (!drag && Math.abs(dy) < 4) return;
		let delta = Math.round(((dy / HOUR_PX) * 60) / SNAP) * SNAP;
		const [lo, hi] =
			origin.mode === 'move'
				? [-seg.startMin, 1440 - seg.endMin]
				: [seg.startMin + SNAP - seg.endMin, 1440 - seg.endMin];
		delta = Math.min(hi, Math.max(lo, delta));
		drag = { mode: origin.mode, delta };
	}
	async function up() {
		const d = drag;
		origin = null;
		if (!d) return;
		dragged = true; // swallow the click that follows the drop
		if (d.delta === 0) return void (drag = null);
		const shift = (iso: string) => new Date(Date.parse(iso) + d.delta * 60000).toISOString();
		busy = true;
		try {
			await onchange!(occ, d.mode === 'move' ? shift(occ.startAt) : occ.startAt, shift(occ.endAt));
		} finally {
			busy = false;
			drag = null;
		}
	}
	function keydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && origin) {
			origin = null;
			drag = null;
			dragged = true;
		}
	}
	function click() {
		if (dragged) dragged = false;
		else onopen(occ);
	}
</script>

<svelte:window onkeydown={keydown} />

<button
	class="ev"
	class:grid={!!seg}
	class:dragging={!!drag}
	class:custom={!!occ.color}
	data-kind="event"
	aria-label="{occ.title}, {range}"
	style:--c={occ.color ?? 'var(--info)'}
	style:top={seg ? `${(top / 60) * HOUR_PX}px` : undefined}
	style:height={seg ? `${((bottom - top) / 60) * HOUR_PX}px` : undefined}
	style:left={seg ? `${(seg.lane / seg.lanes) * 100}%` : undefined}
	style:width={seg ? `calc(${100 / seg.lanes}% - 2px)` : undefined}
	onclick={click}
	onpointerdown={(e) => down(e, 'move')}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={() => {
		origin = null;
		drag = null;
	}}
>
	<span class="title">{occ.title}</span>
	<span class="time">{range}{occ.location ? ` · ${occ.location}` : ''}</span>
	{#if canDrag && seg?.endsHere}
		<span class="grip" role="presentation" onpointerdown={(e) => down(e, 'resize')}></span>
	{/if}
</button>

<style>
	.ev {
		display: block;
		box-sizing: border-box;
		width: 100%;
		min-height: 44px; /* touch target; the hour grid overrides it */
		padding: 2px 8px;
		text-align: left;
		background: var(--c);
		/* Swatches read on both themes with dark ink; the default blue follows the theme. */
		color: var(--accent-ink);
		border: 0;
		border-radius: 6px;
		font-weight: 400;
		overflow: hidden;
	}
	.custom {
		color: #14161a;
	}
	.grid {
		position: absolute;
		min-height: 0;
		padding: 2px 6px;
		border: 1px solid var(--surface);
		touch-action: pan-y;
		user-select: none;
	}
	.title {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-weight: 600;
		font-size: 0.875rem;
		line-height: 1.25;
	}
	.time {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 0.75rem;
		line-height: 1.25;
	}
	.grid:not(.dragging) {
		cursor: grab;
	}
	.dragging {
		z-index: 3;
		cursor: grabbing;
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.35);
	}
	.grip {
		position: absolute;
		inset: auto 0 0 0;
		height: 8px;
		cursor: ns-resize;
	}
</style>
