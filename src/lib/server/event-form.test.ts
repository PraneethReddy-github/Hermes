import { describe, expect, it } from 'vitest';
import { createTestDb } from './db/test-utils';
import { eventExceptions } from './db/schema';
import { currentOccurrence, eventPatchFromForm } from './event-form';
import { createEvent, getEvent, listOccurrences, updateEvent } from './services/events';

const TZ = 'Europe/Berlin';
// Mondays 09:00-10:00 Berlin (UTC+1)
const W1 = '2026-11-02T08:00:00.000Z';
const W2 = '2026-11-09T08:00:00.000Z';

function setup() {
	const db = createTestDb();
	const ev = createEvent(
		db,
		{
			title: 'Standup',
			location: 'Room 1',
			startAt: W1,
			endAt: '2026-11-02T09:00:00.000Z',
			rrule: 'FREQ=WEEKLY'
		},
		TZ
	);
	return { db, ev };
}

/** What the sheet posts for the occurrence `cur`, with overrides. */
function form(cur: { startAt: string; originalStart: string }, over: Record<string, string> = {}) {
	const f = new FormData();
	const base: Record<string, string> = {
		originalStart: cur.originalStart,
		occurrenceStart: cur.startAt,
		title: 'Standup',
		location: 'Room 1',
		startDate: '2026-11-09',
		startTime: '09:00',
		endDate: '2026-11-09',
		endTime: '10:00',
		...over
	};
	for (const [k, v] of Object.entries(base)) f.set(k, v);
	return f;
}

const occ = (db: ReturnType<typeof createTestDb>, id: string, orig: string) =>
	currentOccurrence(db, id, orig, orig, TZ);

describe('eventPatchFromForm on a recurring occurrence', () => {
	it('an unchanged "this" edit has nothing to store', () => {
		const { db, ev } = setup();
		const cur = occ(db, ev.id, W2);
		expect(eventPatchFromForm(form(cur), TZ, 'this', ev, cur)).toEqual({});
	});

	it('"this" keeps only what changed', () => {
		const { db, ev } = setup();
		const cur = occ(db, ev.id, W2);
		const patch = eventPatchFromForm(
			form(cur, { title: 'Retro', endTime: '11:00' }),
			TZ,
			'this',
			ev,
			cur
		);
		expect(patch).toEqual({ title: 'Retro', startAt: W2, endAt: '2026-11-09T10:00:00.000Z' });
	});

	it('title-only "all" edit from a moved occurrence keeps the series start and exceptions', () => {
		const { db, ev } = setup();
		updateEvent(
			db,
			ev.id,
			{ startAt: '2026-11-09T10:00:00.000Z', endAt: '2026-11-09T11:00:00.000Z' },
			'this',
			W2,
			TZ
		);
		const cur = currentOccurrence(db, ev.id, '2026-11-09T10:00:00.000Z', W2, TZ);
		expect(cur.startAt).toBe('2026-11-09T10:00:00.000Z');
		const f = form(cur, { title: 'Daily', startTime: '11:00', endTime: '12:00' }); // 11:00 Berlin = moved slot
		const patch = eventPatchFromForm(f, TZ, 'all', ev, cur);
		expect(patch.startAt).toBeUndefined();
		expect(patch.endAt).toBeUndefined();
		expect(patch.title).toBe('Daily');
		updateEvent(db, ev.id, patch, 'all', W2, TZ);
		expect(getEvent(db, ev.id)!.startAt).toBe(W1);
		expect(db.select().from(eventExceptions).all()).toHaveLength(1);
	});

	it('"all" applies the change made to the occurrence to the series start', () => {
		const { db, ev } = setup();
		const cur = occ(db, ev.id, W2);
		const patch = eventPatchFromForm(
			form(cur, { startTime: '10:30', endTime: '11:30' }),
			TZ,
			'all',
			ev,
			cur
		);
		expect(patch.startAt).toBe('2026-11-02T09:30:00.000Z'); // series Monday 02 Nov, 10:30 Berlin
		expect(patch.endAt).toBe('2026-11-02T10:30:00.000Z');
		updateEvent(db, ev.id, patch, 'all', W2, TZ);
		expect(listOccurrences(db, W2, '2026-11-10T00:00:00.000Z', TZ)[0].startAt).toBe(
			'2026-11-09T09:30:00.000Z'
		);
	});
});
