import { describe, expect, it } from 'vitest';
import { asType, classifyCapture } from './classify';

const o = {
	now: new Date('2026-11-23T10:00:00Z'),
	timeZone: 'Europe/Berlin',
	projectNames: ['Uni']
};
const c = (t: string) => classifyCapture(t, o);

describe('classifyCapture', () => {
	it('time range with a date is an event', () => {
		expect(c('meet Anna thu 14-15')).toMatchObject({
			type: 'event',
			title: 'meet Anna',
			event: {
				startAt: '2026-11-26T13:00:00.000Z',
				endAt: '2026-11-26T14:00:00.000Z',
				allDay: false
			}
		});
	});

	it('range without a date means today, even if already past', () => {
		expect(c('standup 8-9').event?.startAt).toBe('2026-11-23T07:00:00.000Z');
		expect(c('lunch 12:00–13:30').event?.endAt).toBe('2026-11-23T12:30:00.000Z');
		expect(c('von 14 bis 15 Uhr team').event).toMatchObject({
			startAt: '2026-11-23T13:00:00.000Z',
			endAt: '2026-11-23T14:00:00.000Z'
		});
		expect(c('gym 2-3pm').event?.startAt).toBe('2026-11-23T13:00:00.000Z');
		expect(c('call 2pm-3pm').type).toBe('event');
	});

	it('dates and plain numbers are not ranges', () => {
		for (const t of [
			'party 24.12.',
			'2 apples',
			'read 14 to 15 pages',
			'invoice 2025-11-30',
			'room 14-155'
		])
			expect(c(t).type).not.toBe('event');
	});

	it('shopping: buy/get prefix and grocery words', () => {
		expect(c('buy oat milk')).toMatchObject({ type: 'shopping', title: 'oat milk' });
		expect(c('Milch').type).toBe('shopping');
		expect(c('eggs').type).toBe('shopping');
		expect(c('kaufen Brot')).toMatchObject({ type: 'shopping', title: 'Brot' });
	});

	it('grocery words only count in texts of up to 3 words', () => {
		expect(c('discuss milk prices with landlord').type).toBe('task');
	});

	it('notes by prefix', () => {
		expect(c('idea: habit tracker')).toMatchObject({
			type: 'note',
			noteKind: 'idea',
			title: 'habit tracker'
		});
		expect(c('Idee: milk app')).toMatchObject({ type: 'note', noteKind: 'idea' });
		expect(c('research: sqlite fts')).toMatchObject({ noteKind: 'research', title: 'sqlite fts' });
		expect(c('look up flights')).toMatchObject({ noteKind: 'research' });
		expect(c('call dentist')).toMatchObject({
			type: 'note',
			noteKind: 'contact',
			title: 'call dentist'
		});
	});

	it('otherwise a task with quick-add tokens', () => {
		const r = c('SCAD report !3 fri');
		expect(r.type).toBe('task');
		expect(r.quick?.priority).toBe(3);
		expect(r.title).toBe('SCAD report');
	});
});

describe('asType', () => {
	it('task override keeps the range time as due time', () => {
		const r = asType('meet Anna thu 14-15', 'task', o);
		expect(r.type).toBe('task');
		expect(r.title).toBe('meet Anna');
		expect(r.quick?.dueAt).toBe('2026-11-26T13:00:00.000Z');
		expect(r.quick?.dueHasTime).toBe(true);
	});

	it('event override: parsed time, else next full hour, 1 h long', () => {
		expect(asType('dentist thu 9:30', 'event', o).event).toMatchObject({
			startAt: '2026-11-26T08:30:00.000Z',
			endAt: '2026-11-26T09:30:00.000Z'
		});
		expect(asType('dentist', 'event', o).event?.startAt).toBe('2026-11-23T11:00:00.000Z'); // 11:00 Berlin
	});

	it('note and shopping overrides use the text as is (minus buy prefix)', () => {
		expect(asType('buy tea', 'note', o)).toMatchObject({
			type: 'note',
			title: 'buy tea',
			noteKind: 'note'
		});
		expect(asType('write essay', 'shopping', o)).toMatchObject({
			type: 'shopping',
			title: 'write essay'
		});
	});
});
