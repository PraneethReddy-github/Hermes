import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../db/test-utils';
import { createEvent } from './events';
import { createNote } from './notes';
import { searchAll, toFtsQuery } from './search';
import { completeTask, createTask, deleteTask } from './tasks';

const TZ = 'Europe/Berlin';
const NOW = new Date('2026-11-23T10:00:00Z');

describe('toFtsQuery', () => {
	it('quotes and prefixes each word', () => {
		expect(toFtsQuery('SCAD assign')).toBe('"SCAD"* "assign"*');
	});
	it('splits on punctuation and drops empties', () => {
		expect(toFtsQuery('  a(b  --  "x" ')).toBe('"a"* "b"* "x"*');
		expect(toFtsQuery("e-mail don't")).toBe('"e"* "mail"* "don"* "t"*');
		expect(toFtsQuery('"*-()')).toBeNull();
		expect(toFtsQuery('')).toBeNull();
		expect(toFtsQuery('Übung 42')).toBe('"Übung"* "42"*');
	});
	it('caps at 8 terms and 200 chars', () => {
		expect(toFtsQuery('a b c d e f g h i j')!.split(' ')).toHaveLength(8);
		expect(toFtsQuery('x'.repeat(500))).toBe(`"${'x'.repeat(200)}"*`);
	});
});

describe('searchAll', () => {
	it('finds tasks, events and notes; excludes deleted', () => {
		const db = createTestDb();
		const t = createTask(db, { title: 'SCAD report', notes: 'draft the scad outline' });
		const gone = createTask(db, { title: 'SCAD ghost' });
		deleteTask(db, gone.id);
		const e = createEvent(db, {
			title: 'SCAD lecture',
			startAt: '2026-11-23T08:00:00.000Z',
			endAt: '2026-11-23T09:00:00.000Z',
			location: 'Room 4'
		});
		const n = createNote(db, { title: 'Misc', body: 'remember the scad deadline' });
		const r = searchAll(db, 'SCAD', 50, { now: NOW, timeZone: TZ });
		expect(r.tasks.map((h) => h.id)).toEqual([t.id]);
		expect(r.events).toMatchObject([{ id: e.id, extra: 'Mon 23 Nov 09:00', date: '2026-11-23' }]);
		expect(r.notes).toHaveLength(1);
		expect(r.notes[0]).toMatchObject({ id: n.id, title: 'Misc' });
		expect(r.notes[0].snippet).toContain('\u0002scad\u0003');
	});

	it('does not throw on FTS syntax characters', () => {
		const db = createTestDb();
		createTask(db, { title: 'foo bar NEAR title' });
		for (const q of ['"', '*', '-foo', 'a(b', 'NEAR', 'title:x', ' ', '', "'; DROP TABLE x;--"])
			expect(() => searchAll(db, q)).not.toThrow();
		expect(searchAll(db, '*')).toEqual({ tasks: [], events: [], notes: [] });
		expect(searchAll(db, '-foo').tasks).toHaveLength(1);
	});

	it('caps each group at limit; open tasks rank before done', () => {
		const db = createTestDb();
		const done = createTask(db, { title: 'zeta task' });
		completeTask(db, done.id, NOW, TZ);
		const open = createTask(db, { title: 'zeta task' });
		for (let i = 0; i < 3; i++) createNote(db, { title: `zeta ${i}` });
		const r = searchAll(db, 'zeta', 2, { now: NOW, timeZone: TZ });
		expect(r.notes).toHaveLength(2);
		expect(r.tasks.map((h) => h.id)).toEqual([open.id, done.id]);
		expect(r.tasks[1].done).toBe(true);
	});

	it('event extra: recurring shows series start with a loop mark', () => {
		const db = createTestDb();
		createEvent(db, {
			title: 'Standup',
			startAt: '2026-11-02T08:00:00.000Z',
			endAt: '2026-11-02T09:00:00.000Z',
			rrule: 'FREQ=WEEKLY'
		});
		expect(searchAll(db, 'standup', 50, { now: NOW, timeZone: TZ }).events[0].extra).toBe(
			'Mon 2 Nov 09:00 ↻'
		);
	});

	it('finds punctuated words, dates and combining marks', () => {
		const db = createTestDb();
		const t = createTask(db, { title: 'mail', notes: "e-mail don't" });
		const n = createNote(db, { title: 'log', body: 'due 2026-11-23 at the café'.normalize('NFD') });
		for (const q of ['e-mail', "don't"])
			expect(searchAll(db, q).tasks.map((h) => h.id)).toEqual([t.id]);
		expect(searchAll(db, '2026-11-23').notes.map((h) => h.id)).toEqual([n.id]);
		expect(searchAll(db, 'café'.normalize('NFD')).notes.map((h) => h.id)).toEqual([n.id]);
	});

	it('hides rows soft-deleted behind the index', () => {
		const db = createTestDb();
		createTask(db, { title: 'qux task' });
		createEvent(db, {
			title: 'qux event',
			startAt: '2026-11-23T08:00:00.000Z',
			endAt: '2026-11-23T09:00:00.000Z'
		});
		createNote(db, { title: 'qux note' });
		expect(searchAll(db, 'qux').tasks).toHaveLength(1);
		for (const t of ['tasks', 'events', 'notes'])
			db.run(sql.raw(`UPDATE ${t} SET deleted_at = '2026-11-23T00:00:00.000Z'`));
		expect(searchAll(db, 'qux')).toEqual({ tasks: [], events: [], notes: [] });
	});
});
