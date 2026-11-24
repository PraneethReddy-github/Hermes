import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb } from '../db/test-utils';
import { auditLog, eventExceptions, events } from '../db/schema';
import {
	createEvent,
	deleteEvent,
	getEvent,
	listOccurrences,
	updateEvent,
	type Event
} from './events';
import { createProject } from './projects';
import { createTask, listTasksInRange } from './tasks';

const TZ = 'Europe/Berlin';
const WEEKLY = 'FREQ=WEEKLY';
// Mondays 09:00 Berlin (CET = UTC+1): 2, 9, 16, 23 Nov
const W1 = '2026-11-02T08:00:00.000Z';
const W2 = '2026-11-09T08:00:00.000Z';
const W3 = '2026-11-16T08:00:00.000Z';
const W4 = '2026-11-23T08:00:00.000Z';
const RS = '2026-11-02T00:00:00.000Z';
const RE = '2026-11-30T00:00:00.000Z';

const search = (db: ReturnType<typeof createTestDb>, q: string) =>
	db
		.all<{ entity_id: string }>(
			sql`SELECT entity_id FROM search_index WHERE search_index MATCH ${q}`
		)
		.map((r) => r.entity_id);
const weekly = (
	db: ReturnType<typeof createTestDb>,
	extra: Partial<Parameters<typeof createEvent>[1]> = {}
) =>
	createEvent(db, {
		title: 'Standup',
		startAt: W1,
		endAt: '2026-11-02T09:00:00.000Z',
		rrule: WEEKLY,
		...extra
	});
const plusHour = (iso: string) => new Date(Date.parse(iso) + 3600000).toISOString();
const occ = (db: ReturnType<typeof createTestDb>, s = RS, e = RE) => listOccurrences(db, s, e, TZ);

describe('createEvent', () => {
	it('validates input at the boundary', () => {
		const db = createTestDb();
		const ok = { title: 'x', startAt: W1, endAt: '2026-11-02T09:00:00Z' };
		expect(() => createEvent(db, { ...ok, title: '  ' })).toThrow('Add a title');
		expect(() => createEvent(db, { ...ok, title: 'x'.repeat(201) })).toThrow();
		expect(() => createEvent(db, { ...ok, startAt: 'nope' })).toThrow('Invalid date');
		expect(() => createEvent(db, { ...ok, endAt: '' })).toThrow('Invalid date');
		expect(() => createEvent(db, { ...ok, endAt: W1 })).toThrow('End must be after start');
		expect(() => createEvent(db, { ...ok, endAt: '2026-11-02T07:00:00Z' })).toThrow(
			'End must be after start'
		);
		expect(() => createEvent(db, { ...ok, rrule: 'FREQ=HOURLY' })).toThrow('Invalid repeat rule');
		expect(() => createEvent(db, { ...ok, color: '#123456' })).toThrow('Invalid colour');
		expect(() => createEvent(db, { ...ok, projectId: 'nope' })).toThrow('Project not found');
		const p = createProject(db, { name: 'P' });
		expect(createEvent(db, { ...ok, color: '#D4AF37', projectId: p.id }).projectId).toBe(p.id);
	});

	it('indexes title, location and notes', () => {
		const db = createTestDb();
		const e = createEvent(db, {
			title: 'Dentist',
			location: 'Hauptstrasse',
			notes: 'bring xray',
			startAt: W1,
			endAt: '2026-11-02T09:00:00Z'
		});
		expect(e.title).toBe('Dentist');
		for (const q of ['dentist', 'hauptstrasse', 'xray']) expect(search(db, q)).toEqual([e.id]);
	});

	it('pins all-day events to local midnights', () => {
		const db = createTestDb();
		// Berlin 24-25 Nov (inclusive), given as arbitrary instants
		const e = createEvent(
			db,
			{
				title: 'Trip',
				allDay: true,
				startAt: '2026-11-24T10:00:00Z',
				endAt: '2026-11-25T10:00:00Z'
			},
			TZ
		);
		expect(e.startAt).toBe('2026-11-23T23:00:00.000Z');
		expect(e.endAt).toBe('2026-11-25T23:00:00.000Z'); // midnight after the last day
		const again = createEvent(
			db,
			{ title: 'Trip2', allDay: true, startAt: e.startAt, endAt: e.endAt },
			TZ
		);
		expect([again.startAt, again.endAt]).toEqual([e.startAt, e.endAt]);
	});
});

describe('listOccurrences', () => {
	it('includes an event that started before the range, excludes ones outside', () => {
		const db = createTestDb();
		const e = createEvent(db, {
			title: 'Conf',
			startAt: '2026-11-01T22:00:00Z',
			endAt: '2026-11-02T02:00:00Z'
		});
		createEvent(db, { title: 'Later', startAt: RE, endAt: '2026-11-30T01:00:00Z' });
		createEvent(db, { title: 'Earlier', startAt: '2026-11-01T00:00:00Z', endAt: RS });
		expect(occ(db).map((o) => o.eventId)).toEqual([e.id]);
	});

	it('expands a weekly series over 4 weeks and sorts by start', () => {
		const db = createTestDb();
		const e = weekly(db);
		createEvent(db, {
			title: 'One-off',
			startAt: '2026-11-03T08:00:00Z',
			endAt: '2026-11-03T09:00:00Z'
		});
		const list = occ(db);
		expect(list.filter((o) => o.eventId === e.id).map((o) => o.startAt)).toEqual([W1, W2, W3, W4]);
		expect(list.map((o) => o.startAt)).toEqual([W1, '2026-11-03T08:00:00.000Z', W2, W3, W4]);
		const first = list[0];
		expect(first).toMatchObject({
			endAt: '2026-11-02T09:00:00.000Z',
			originalStart: W1,
			isRecurring: true,
			allDay: false
		});
	});

	it('includes a recurring occurrence that began before the range but overlaps it', () => {
		const db = createTestDb();
		const e = weekly(db, { endAt: '2026-11-02T20:00:00Z' }); // 12h long
		const list = occ(db, '2026-11-09T12:00:00Z', '2026-11-09T13:00:00Z');
		expect(list.map((o) => [o.eventId, o.startAt])).toEqual([[e.id, W2]]);
	});

	it('hides deleted events', () => {
		const db = createTestDb();
		const e = weekly(db);
		deleteEvent(db, e.id, 'all');
		expect(occ(db)).toEqual([]);
	});

	it('applies exceptions: moved into range appears, moved out disappears, cancelled hidden', () => {
		const db = createTestDb();
		const e = weekly(db);
		// W2 moved to Dec 3 (outside Nov range); W3 moved from outside... use W4 -> Nov 10
		updateEvent(
			db,
			e.id,
			{ startAt: '2026-12-03T08:00:00Z', endAt: '2026-12-03T09:00:00Z' },
			'this',
			W2,
			TZ
		);
		updateEvent(
			db,
			e.id,
			{ startAt: '2026-11-10T08:00:00Z', endAt: '2026-11-10T09:00:00Z' },
			'this',
			W4,
			TZ
		);
		deleteEvent(db, e.id, 'this', W3);
		expect(occ(db).map((o) => o.startAt)).toEqual([W1, '2026-11-10T08:00:00.000Z']);
		// range containing only Dec 3: the moved occurrence shows, keyed by its original start
		const dec = occ(db, '2026-12-01T00:00:00Z', '2026-12-07T00:00:00Z');
		expect(dec.filter((o) => o.originalStart === W2).map((o) => o.startAt)).toEqual([
			'2026-12-03T08:00:00.000Z'
		]);
	});
});

describe('updateEvent / deleteEvent', () => {
	it('this: delete hides exactly one occurrence', () => {
		const db = createTestDb();
		const e = weekly(db);
		deleteEvent(db, e.id, 'this', W2);
		expect(occ(db).map((o) => o.startAt)).toEqual([W1, W3, W4]);
		expect(getEvent(db, e.id)?.deletedAt).toBeNull();
	});

	it('this: edit moves one occurrence and re-editing updates the same row', () => {
		const db = createTestDb();
		const e = weekly(db);
		updateEvent(
			db,
			e.id,
			{ startAt: '2026-11-09T10:00:00Z', endAt: '2026-11-09T11:00:00Z' },
			'this',
			W2,
			TZ
		);
		updateEvent(db, e.id, { title: 'Moved', startAt: '2026-11-09T12:00:00Z' }, 'this', W2, TZ);
		const rows = db.select().from(eventExceptions).where(eq(eventExceptions.eventId, e.id)).all();
		expect(rows).toHaveLength(1);
		const o = occ(db).find((x) => x.originalStart === W2)!;
		expect(o).toMatchObject({
			title: 'Moved',
			startAt: '2026-11-09T12:00:00.000Z',
			endAt: '2026-11-09T13:00:00.000Z' // duration kept when only start changes
		});
		expect(occ(db).find((x) => x.originalStart === W1)!.title).toBe('Standup');
	});

	it('this: rejects unknown occurrence, series-wide fields and bad ranges', () => {
		const db = createTestDb();
		const e = weekly(db);
		expect(() => deleteEvent(db, e.id, 'this', '2026-11-03T08:00:00.000Z')).toThrow(
			'Occurrence not found'
		);
		expect(() => updateEvent(db, e.id, { title: 'x' }, 'this', undefined, TZ)).toThrow(
			'Occurrence start required'
		);
		expect(() => updateEvent(db, e.id, { notes: 'x' }, 'this', W2, TZ)).toThrow();
		expect(() => updateEvent(db, e.id, { endAt: W2 }, 'this', W2, TZ)).toThrow(
			'End must be after start'
		);
	});

	it('all: edits the series row and reindexes', () => {
		const db = createTestDb();
		const e = weekly(db);
		const u = updateEvent(db, e.id, { title: 'Sync', notes: 'zebra' }, 'all', undefined, TZ);
		expect(u.title).toBe('Sync');
		expect(occ(db).every((o) => o.title === 'Sync')).toBe(true);
		expect(search(db, 'zebra')).toEqual([e.id]);
		expect(() => updateEvent(db, e.id, { endAt: W1 }, 'all', undefined, TZ)).toThrow(
			'End must be after start'
		);
	});

	it('following from week 3: weeks 1-2 old title, 3-4 new title', () => {
		const db = createTestDb();
		const e = weekly(db);
		const tail = updateEvent(db, e.id, { title: 'New' }, 'following', W3, TZ);
		expect(tail.id).not.toBe(e.id);
		expect(tail.startAt).toBe(W3);
		expect(occ(db).map((o) => [o.title, o.startAt])).toEqual([
			['Standup', W1],
			['Standup', W2],
			['New', W3],
			['New', W4]
		]);
		expect(search(db, 'new')).toEqual([tail.id]);
	});

	it('following at series start equals all', () => {
		const db = createTestDb();
		const e = weekly(db);
		const u = updateEvent(db, e.id, { title: 'All' }, 'following', W1, TZ);
		expect(u.id).toBe(e.id);
		expect(db.select().from(events).all()).toHaveLength(1);
		expect(occ(db).map((o) => o.title)).toEqual(['All', 'All', 'All', 'All']);
	});

	it('following with COUNT: tail gets the remaining count', () => {
		const db = createTestDb();
		const e = weekly(db, { rrule: 'FREQ=WEEKLY;COUNT=6' });
		const tail = updateEvent(db, e.id, { title: 'New' }, 'following', W3, TZ);
		expect(tail.rrule).toContain('COUNT=4');
		expect(getEvent(db, e.id)!.rrule).toMatch(/UNTIL=/);
		expect(getEvent(db, e.id)!.rrule).not.toMatch(/COUNT/);
		const all = occ(db, RS, '2027-01-31T00:00:00Z');
		expect(all).toHaveLength(6);
		expect(all.filter((o) => o.title === 'New')).toHaveLength(4);
	});

	it('following moves exceptions to the tail when time of day is unchanged, drops them otherwise', () => {
		for (const [patch, kept] of [
			[{ title: 'New' }, true],
			[{ startAt: '2026-11-16T09:00:00Z', endAt: '2026-11-16T10:00:00Z' }, false]
		] as const) {
			const db = createTestDb();
			const e = weekly(db);
			deleteEvent(db, e.id, 'this', W2); // head: stays
			updateEvent(db, e.id, { title: 'Ex' }, 'this', W4, TZ); // tail
			const tail = updateEvent(db, e.id, patch, 'following', W3, TZ);
			const rows = db.select().from(eventExceptions).all();
			expect(rows.filter((r) => r.eventId === e.id).map((r) => r.originalStart)).toEqual([W2]);
			expect(rows.filter((r) => r.eventId === tail.id).map((r) => r.originalStart)).toEqual(
				kept ? [W4] : []
			);
			if (kept) expect(occ(db).find((o) => o.originalStart === W4)!.title).toBe('Ex');
		}
	});

	it('following delete truncates the series and drops later exceptions', () => {
		const db = createTestDb();
		const e = weekly(db);
		updateEvent(db, e.id, { title: 'Ex' }, 'this', W4, TZ);
		deleteEvent(db, e.id, 'following', W3);
		expect(occ(db).map((o) => o.startAt)).toEqual([W1, W2]);
		expect(db.select().from(eventExceptions).all()).toHaveLength(0);
		deleteEvent(db, e.id, 'following', W1);
		expect(getEvent(db, e.id)).toBeUndefined();
	});

	it('all delete soft-deletes, unindexes, audits', () => {
		const db = createTestDb();
		const e: Event = weekly(db, { title: 'Gone' });
		deleteEvent(db, e.id, 'all');
		expect(getEvent(db, e.id)).toBeUndefined();
		expect(db.select().from(events).where(eq(events.id, e.id)).get()!.deletedAt).not.toBeNull();
		expect(search(db, 'gone')).toEqual([]);
		expect(
			db.select().from(auditLog).where(eq(auditLog.action, 'event.delete')).all()
		).toHaveLength(1);
		expect(() => updateEvent(db, e.id, { title: 'x' }, 'all', undefined, TZ)).toThrow(
			'Event not found'
		);
	});
});

describe('fix round 1', () => {
	it('toIso rejects offset-less and rollover dates', () => {
		const db = createTestDb();
		const ok = { title: 'x', startAt: W1, endAt: '2026-11-02T09:00:00Z' };
		for (const startAt of ['2026-11-02T08:00', '2026-02-31T08:00:00Z', '2026-11-02T24:00:00Z'])
			expect(() => createEvent(db, { ...ok, startAt })).toThrow('Invalid date');
		expect(createEvent(db, { ...ok, startAt: '2026-11-02T09:00:00+01:00' }).startAt).toBe(W1);
	});

	it('following from an occurrence with an exception: the patch wins', () => {
		const db = createTestDb();
		const e = weekly(db);
		updateEvent(db, e.id, { title: 'Old' }, 'this', W2, TZ);
		updateEvent(db, e.id, { title: 'New' }, 'following', W2, TZ);
		expect(occ(db).map((o) => o.title)).toEqual(['Standup', 'New', 'New', 'New']);
	});

	it('all edit that moves the series start drops its exceptions', () => {
		const db = createTestDb();
		const e = weekly(db);
		deleteEvent(db, e.id, 'this', W2);
		updateEvent(
			db,
			e.id,
			{ startAt: '2026-11-03T08:00:00Z', endAt: '2026-11-03T09:00:00Z' },
			'all',
			undefined,
			TZ
		);
		updateEvent(db, e.id, { startAt: W1, endAt: '2026-11-02T09:00:00Z' }, 'all', undefined, TZ);
		expect(occ(db).map((o) => o.startAt)).toEqual([W1, W2, W3, W4]);
	});

	it('moved exceptions far from the range are skipped cheaply', () => {
		const db = createTestDb();
		const e = weekly(db, {
			rrule: 'FREQ=DAILY',
			startAt: '2000-01-01T08:00:00Z',
			endAt: '2000-01-01T09:00:00Z'
		});
		for (let i = 0; i < 80; i++) {
			const d = new Date(Date.UTC(2000, 0, 2 + i, 8)).toISOString();
			updateEvent(db, e.id, { startAt: plusHour(d) }, 'this', d, TZ);
		}
		const t = Date.now();
		expect(occ(db).length).toBe(28);
		expect(Date.now() - t).toBeLessThan(1500);
	});
});

describe('listTasksInRange', () => {
	it('returns open, live tasks due in the half-open range, sorted by due', () => {
		const db = createTestDb();
		const b = createTask(db, { title: 'b', dueAt: '2026-11-05T10:00:00Z', dueHasTime: true });
		const a = createTask(db, { title: 'a', dueAt: '2026-11-03T10:00:00Z', dueHasTime: true });
		createTask(db, { title: 'edge', dueAt: RE, dueHasTime: true });
		createTask(db, { title: 'before', dueAt: '2026-11-01T10:00:00Z', dueHasTime: true });
		createTask(db, { title: 'undated' });
		expect(listTasksInRange(db, RS, RE).map((t) => t.id)).toEqual([a.id, b.id]);
	});
});
