import { describe, expect, it } from 'vitest';
import { taskPatchFromForm } from './task-form';

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
const TZ = 'Europe/Berlin';

describe('taskPatchFromForm', () => {
	it('converts local date and time with the user timezone', () => {
		const p = taskPatchFromForm(
			form({ title: ' a ', dueDate: '2026-11-24', dueTime: '09:30' }),
			TZ
		);
		expect(p).toMatchObject({ dueAt: '2026-11-24T08:30:00.000Z', dueHasTime: true });
	});
	it('date without time is end of local day, date-only', () => {
		const p = taskPatchFromForm(form({ title: 'a', dueDate: '2026-07-01' }), TZ);
		expect(p).toMatchObject({ dueAt: '2026-07-01T21:59:59.999Z', dueHasTime: false });
	});
	it('empty fields clear; repeat presets and custom text map to rrule', () => {
		const p = taskPatchFromForm(form({ title: 'a', repeat: '' }), TZ);
		expect(p).toMatchObject({ dueAt: null, startAt: null, estimateMin: null, rrule: null });
		expect(taskPatchFromForm(form({ title: 'a', repeat: 'FREQ=WEEKLY' }), TZ).rrule).toBe(
			'FREQ=WEEKLY'
		);
		expect(
			taskPatchFromForm(form({ title: 'a', repeat: 'custom', rrule: 'FREQ=DAILY;INTERVAL=3' }), TZ)
				.rrule
		).toBe('FREQ=DAILY;INTERVAL=3');
	});
	it.each([
		[{ dueDate: '2026-02-30' }, 'Invalid date'],
		[{ dueDate: 'tomorrow' }, 'Invalid date'],
		[{ dueDate: '2026-11-24', dueTime: '25:00' }, 'Invalid time'],
		[{ dueTime: '09:00' }, 'Pick a due date for the time'],
		[{ estimate: '-5' }, 'Invalid estimate'],
		[{ estimate: '1.5' }, 'Invalid estimate']
	])('rejects %j', (extra, msg) => {
		expect(() => taskPatchFromForm(form({ title: 'a', ...extra }), TZ)).toThrow(msg);
	});
});
