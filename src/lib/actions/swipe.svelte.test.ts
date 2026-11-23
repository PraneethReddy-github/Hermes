import { describe, expect, it, vi } from 'vitest';
import { swipe } from './swipe';

function setup(pointerType = 'touch') {
	const node = document.createElement('div');
	document.body.append(node);
	const onRight = vi.fn();
	const onLeft = vi.fn();
	swipe(node, { onRight, onLeft, threshold: 80 });
	const fire = (type: string, x: number, y: number) =>
		node.dispatchEvent(
			new PointerEvent(type, { pointerId: 1, pointerType, isPrimary: true, clientX: x, clientY: y })
		);
	/** Press at (0,0), move through the points, release at the last one. */
	const drag = (...pts: [number, number][]) => {
		fire('pointerdown', 0, 0);
		for (const [x, y] of pts) fire('pointermove', x, y);
		const [x, y] = pts.at(-1)!;
		fire('pointerup', x, y);
	};
	return { node, onRight, onLeft, drag };
}

describe('swipe', () => {
	it('fires onRight / onLeft past the threshold', () => {
		const r = setup();
		r.drag([30, 2], [100, 4]);
		expect(r.onRight).toHaveBeenCalledOnce();
		const l = setup();
		l.drag([-30, 2], [-100, 4]);
		expect(l.onLeft).toHaveBeenCalledOnce();
	});

	it('does nothing under the threshold', () => {
		const s = setup();
		s.drag([30, 0], [60, 0]);
		expect(s.onRight).not.toHaveBeenCalled();
	});

	it('does not fire while scrolling vertically', () => {
		const s = setup();
		s.drag([5, 30], [120, 60]); // vertical first: gesture is abandoned
		expect(s.onRight).not.toHaveBeenCalled();
		const diag = setup();
		diag.drag([30, 5], [100, 140]); // swipe that ends more vertical than horizontal
		expect(diag.onRight).not.toHaveBeenCalled();
	});

	it('ignores the mouse and resets its offset after release', () => {
		const m = setup('mouse');
		m.drag([100, 0]);
		expect(m.onRight).not.toHaveBeenCalled();
		const t = setup();
		t.drag([30, 0], [100, 0]);
		expect(t.node.style.getPropertyValue('--dx')).toBe('');
	});
});
