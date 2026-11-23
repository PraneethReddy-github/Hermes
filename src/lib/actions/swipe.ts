export interface SwipeOptions {
	onRight?: () => void;
	onLeft?: () => void;
	/** Horizontal travel in px that counts as a swipe. */
	threshold?: number;
}

const SLOP = 10; // travel before we decide between a scroll and a swipe
const MAX = 140; // furthest the row follows the finger

/**
 * Horizontal swipe on touch/pen. Sets `--dx` (px) and `data-swipe="left|right"` while dragging
 * so the row can slide and reveal what is underneath. Vertical movement is left to the browser
 * (touch-action: pan-y) and abandons the gesture. Mouse is ignored: desktop has buttons.
 */
export function swipe(node: HTMLElement, opts: SwipeOptions) {
	let o = opts;
	let id: number | null = null;
	let x0 = 0;
	let y0 = 0;
	let dx = 0;
	let dy = 0;
	let active = false;
	let swiped = false;

	node.style.touchAction = 'pan-y';

	const show = (v: number) => {
		node.style.setProperty('--dx', `${v}px`);
		node.dataset.swipe = v > 0 ? 'right' : v < 0 ? 'left' : '';
	};
	const reset = () => {
		id = null;
		active = false;
		delete node.dataset.dragging;
		node.style.removeProperty('--dx');
		delete node.dataset.swipe;
	};

	const down = (e: PointerEvent) => {
		if (e.pointerType === 'mouse' || id !== null || !e.isPrimary) return;
		id = e.pointerId;
		x0 = e.clientX;
		y0 = e.clientY;
		dx = dy = 0;
	};
	const move = (e: PointerEvent) => {
		if (e.pointerId !== id) return;
		dx = e.clientX - x0;
		dy = e.clientY - y0;
		if (!active) {
			if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) return void (id = null); // scrolling
			if (Math.abs(dx) < SLOP || Math.abs(dx) <= Math.abs(dy)) return;
			active = true;
			node.setPointerCapture(e.pointerId);
			node.dataset.dragging = '';
		}
		const allowed = dx > 0 ? o.onRight : o.onLeft;
		show(allowed ? Math.max(-MAX, Math.min(MAX, dx)) : 0);
	};
	const up = (e: PointerEvent) => {
		if (e.pointerId !== id) return;
		const fire =
			active && Math.abs(dx) >= (o.threshold ?? 80) && Math.abs(dx) > Math.abs(dy)
				? dx > 0
					? o.onRight
					: o.onLeft
				: undefined;
		if (active) {
			swiped = true;
			setTimeout(() => (swiped = false), 50);
		}
		reset();
		fire?.();
	};
	const click = (e: MouseEvent) => {
		if (swiped) {
			e.stopPropagation();
			e.preventDefault();
		}
	};

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', reset);
	node.addEventListener('click', click, true);
	return {
		update(next: SwipeOptions) {
			o = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', reset);
			node.removeEventListener('click', click, true);
		}
	};
}
