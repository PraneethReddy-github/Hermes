import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../db/test-utils';
import { taskCompletions, tasks } from '../db/schema';
import {
	clearCompleted,
	completeTask,
	countOpenByLabel,
	countOpenByProject,
	createTask,
	createTaskFromQuickAdd,
	deleteTask,
	getTask,
	listByProject,
	listDoneByProject,
	listCompleted,
	listToday,
	listUpcoming,
	reorderTasks,
	rescheduleTask,
	restoreTask,
	uncompleteTask,
	updateTask
} from './tasks';
import { createProject, listProjects } from './projects';
import { deleteLabel, renameLabel, updateLabel } from './labels';

const TZ = 'Europe/Berlin';
const NOW = new Date('2026-11-23T10:00:00Z'); // Mon 23 Nov, 11:00 Berlin
const search = (db: ReturnType<typeof createTestDb>, q: string) =>
	db
		.all<{ entity_id: string }>(
			sql`SELECT entity_id FROM search_index WHERE search_index MATCH ${q}`
		)
		.map((r) => r.entity_id);

describe('createTask', () => {
	it('rejects blank title', () => {
		expect(() => createTask(createTestDb(), { title: '  ' })).toThrow('Add a title');
	});

	it('validates title length, priority and rrule', () => {
		const db = createTestDb();
		expect(() => createTask(db, { title: 'x'.repeat(501) })).toThrow('Title too long');
		expect(() => createTask(db, { title: 'x', priority: 5 as never })).toThrow('Invalid priority');
		for (const rrule of ['', 'nonsense', 'FREQ=HOURLY', 'INTERVAL=2'])
			expect(() => createTask(db, { title: 'x', rrule })).toThrow('Invalid repeat rule');
		expect(() =>
			updateTask(db, createTask(db, { title: 'y' }).id, { rrule: 'FREQ=SECONDLY' })
		).toThrow('Invalid repeat rule');
	});

	it('defaults to Inbox, appends position, indexes notes and labels', () => {
		const db = createTestDb();
		const a = createTask(db, { title: 'alpha', notes: 'banana', labelNames: ['Zed', 'apple'] });
		const b = createTask(db, { title: 'beta' });
		expect(b.position).toBe(a.position + 1);
		expect(a.labels.map((l) => l.name)).toEqual(['apple', 'Zed']);
		expect(search(db, 'banana')).toEqual([a.id]);
		expect(search(db, 'zed')).toEqual([a.id]);
	});

	it('rejects nested subtasks', () => {
		const db = createTestDb();
		const p = createTask(db, { title: 'p' });
		const c = createTask(db, { title: 'c', parentId: p.id });
		expect(c.projectId).toBe(p.projectId);
		expect(() => createTask(db, { title: 'g', parentId: c.id })).toThrow(
			'Subtasks cannot be nested'
		);
		expect(() => updateTask(db, p.id, { parentId: c.id })).toThrow('Subtasks cannot be nested');
		expect(getTask(db, p.id)?.subtasks?.map((s) => s.id)).toEqual([c.id]);
	});

	it('snaps a BYDAY task to the first matching weekday, keeping time', () => {
		const db = createTestDb();
		// Mon 23 Nov 18:00 Berlin = 17:00Z
		const t = createTask(
			db,
			{
				title: 'x',
				rrule: 'FREQ=WEEKLY;BYDAY=TU',
				dueAt: '2026-11-23T17:00:00Z',
				dueHasTime: true
			},
			{ now: NOW, timeZone: TZ }
		);
		expect(t.dueAt).toBe('2026-11-24T17:00:00.000Z');
		const u = updateTask(db, t.id, { dueAt: '2026-11-25T17:00:00Z' }, { now: NOW, timeZone: TZ });
		expect(u.dueAt).toBe('2026-12-01T17:00:00.000Z');
	});

	it('repeating task without dueAt gets first occurrence, date-only', () => {
		const db = createTestDb();
		const daily = createTask(db, { title: 'd', rrule: 'FREQ=DAILY' }, { now: NOW, timeZone: TZ });
		expect(daily.dueAt).toBe('2026-11-23T22:59:59.999Z');
		expect(daily.dueHasTime).toBe(false);
		const tue = createTask(
			db,
			{ title: 't', rrule: 'FREQ=WEEKLY;BYDAY=TU' },
			{ now: NOW, timeZone: TZ }
		);
		expect(tue.dueAt).toBe('2026-11-24T22:59:59.999Z');
	});
});

describe('createTaskFromQuickAdd', () => {
	it('puts task in Uni with label and priority', () => {
		const db = createTestDb();
		const t = createTaskFromQuickAdd(db, 'Write report +uni #urgent !1 tomorrow', {
			now: NOW,
			timeZone: TZ
		});
		const uni = listProjects(db).find((p) => p.name === 'Uni')!;
		expect(t.projectId).toBe(uni.id);
		expect(t.labels.map((l) => l.name)).toEqual(['urgent']);
		expect(t.priority).toBe(1);
		expect(t.title).toBe('Write report');
		expect(t.dueAt).toBe('2026-11-24T22:59:59.999Z');
	});

	it('falls back to defaultProjectId, rejects empty title', () => {
		const db = createTestDb();
		const p = createProject(db, { name: 'Other' });
		expect(
			createTaskFromQuickAdd(db, 'plain', { now: NOW, timeZone: TZ, defaultProjectId: p.id })
				.projectId
		).toBe(p.id);
		expect(() => createTaskFromQuickAdd(db, '   ', { now: NOW, timeZone: TZ })).toThrow(
			'Add a title'
		);
	});
});

describe('queries', () => {
	it('listToday includes overdue and due today, excludes tomorrow and completed', () => {
		const db = createTestDb();
		const mk = (title: string, dueAt: string) => createTask(db, { title, dueAt, dueHasTime: true });
		const overdue = mk('overdue', '2026-11-20T09:00:00Z');
		const today = mk('today', '2026-11-23T15:00:00Z');
		mk('tomorrow', '2026-11-24T15:00:00Z');
		const done = mk('done', '2026-11-23T08:00:00Z');
		completeTask(db, done.id, NOW, TZ);
		createTask(db, { title: 'undated' });
		const started = createTask(db, { title: 'started', startAt: '2026-11-22T00:00:00Z' });
		expect(listToday(db, NOW, TZ).map((t) => t.id)).toEqual([overdue.id, today.id, started.id]);
	});

	it('listToday puts Sunday 23:30 task on Sunday (local day, not UTC day)', () => {
		const db = createTestDb();
		// now = Sun 2027-03-28 00:30 Berlin (CET) but still Sat 27 Mar in UTC
		const now = new Date('2027-03-27T23:30:00Z');
		// Sun 23:30 Berlin is CEST after the DST switch = 21:30Z
		const sunLate = createTask(db, {
			title: 'late',
			dueAt: '2027-03-28T21:30:00.000Z',
			dueHasTime: true
		});
		// Mon 00:00 Berlin (CEST) = Sun 22:00Z: next local day, same UTC day
		createTask(db, { title: 'mon', dueAt: '2027-03-28T22:00:00Z', dueHasTime: true });
		expect(listToday(db, now, TZ).map((x) => x.id)).toEqual([sunLate.id]);
	});

	it('listUpcoming groups by local day, excludes today and beyond window', () => {
		const db = createTestDb();
		createTask(db, { title: 'today', dueAt: '2026-11-23T15:00:00Z', dueHasTime: true });
		const a = createTask(db, { title: 'a', dueAt: '2026-11-24T22:59:59.999Z' });
		const b = createTask(db, { title: 'b', dueAt: '2026-11-24T08:00:00Z', dueHasTime: true });
		createTask(db, { title: 'far', dueAt: '2026-12-07T10:00:00Z', dueHasTime: true }); // day 14 = excluded
		const inside = createTask(db, { title: 'in', dueAt: '2026-12-06T10:00:00Z', dueHasTime: true });
		const up = listUpcoming(db, NOW, TZ);
		expect(up.map((g) => g.day)).toEqual(['2026-11-24', '2026-12-06']);
		expect(up[0].tasks.map((t) => t.id)).toEqual([b.id, a.id]);
		expect(up[1].tasks[0].id).toBe(inside.id);
	});

	it('listByProject nests subtasks; listCompleted respects window', () => {
		const db = createTestDb();
		const p = createTask(db, { title: 'p' });
		createTask(db, { title: 'c', parentId: p.id });
		const list = listByProject(db, p.projectId);
		expect(list).toHaveLength(1);
		expect(list[0].subtasks).toHaveLength(1);
		completeTask(db, p.id, NOW, TZ);
		expect(listCompleted(db, NOW).map((t) => t.id)).toEqual([p.id]);
		expect(listCompleted(db, new Date('2027-03-01T00:00:00Z'))).toEqual([]);
	});

	it('every list carries subtasks so the task sheet can show them', () => {
		const db = createTestDb();
		const p = createTask(db, { title: 'p', dueAt: '2026-11-23T10:00:00Z', dueHasTime: true });
		createTask(db, { title: 'c', parentId: p.id });
		expect(listToday(db, NOW, TZ)[0].subtasks).toHaveLength(1);
	});

	it('reorderTasks sets positions and ignores other projects', () => {
		const db = createTestDb();
		const a = createTask(db, { title: 'a' });
		const b = createTask(db, { title: 'b' });
		const other = createProject(db, { name: 'Other' });
		const x = createTask(db, { title: 'x', projectId: other.id });
		reorderTasks(db, a.projectId, [b.id, x.id, a.id]);
		expect(listByProject(db, a.projectId).map((t) => t.id)).toEqual([b.id, a.id]);
		expect(getTask(db, x.id)?.position).toBe(0);
	});
});

describe('completeTask', () => {
	it('on weekly task advances due past now and records completion', () => {
		const db = createTestDb();
		const t = createTask(
			db,
			{
				title: 'w',
				rrule: 'FREQ=WEEKLY;BYDAY=MO',
				dueAt: '2026-11-09T08:00:00Z',
				dueHasTime: true
			},
			{ now: NOW, timeZone: TZ }
		);
		const done = completeTask(db, t.id, NOW, TZ);
		expect(done.completedAt).toBeNull();
		expect(done.dueAt).toBe('2026-11-30T08:00:00.000Z');
		expect(db.select().from(taskCompletions).all()).toHaveLength(1);
	});

	it('uncomplete restores a repeating task: due, start and the completion record', () => {
		const db = createTestDb();
		const t = createTask(
			db,
			{
				title: 'w',
				rrule: 'FREQ=WEEKLY;BYDAY=MO',
				dueAt: '2026-11-09T08:00:00Z',
				dueHasTime: true,
				startAt: '2026-11-08T08:00:00Z'
			},
			{ now: NOW, timeZone: TZ }
		);
		completeTask(db, t.id, NOW, TZ);
		const back = uncompleteTask(db, t.id);
		expect(back.dueAt).toBe('2026-11-09T08:00:00.000Z');
		expect(back.startAt).toBe('2026-11-08T08:00:00.000Z');
		expect(db.select().from(taskCompletions).all()).toHaveLength(0);
		expect(uncompleteTask(db, t.id).dueAt).toBe('2026-11-09T08:00:00.000Z'); // nothing left to undo
	});

	it('uncompleting a finished repeating task keeps earlier completion records', () => {
		const db = createTestDb();
		const t = createTask(
			db,
			{
				title: 'c',
				rrule: 'FREQ=DAILY;UNTIL=20261124T235959Z',
				dueAt: '2026-11-23T08:00:00Z',
				dueHasTime: true
			},
			{ now: NOW, timeZone: TZ }
		);
		completeTask(db, t.id, NOW, TZ);
		const last = completeTask(db, t.id, new Date('2026-11-24T09:00:00Z'), TZ);
		expect(last.completedAt).not.toBeNull();
		expect(uncompleteTask(db, t.id).completedAt).toBeNull();
		expect(db.select().from(taskCompletions).all()).toHaveLength(1);
	});

	it('keeps date-only due at end of local day', () => {
		const db = createTestDb();
		const t = createTask(db, { title: 'd', rrule: 'FREQ=DAILY' }, { now: NOW, timeZone: TZ });
		expect(completeTask(db, t.id, NOW, TZ).dueAt).toBe('2026-11-24T22:59:59.999Z');
	});

	it('non-repeating just completes and does not complete subtasks', () => {
		const db = createTestDb();
		const p = createTask(db, { title: 'p' });
		const c = createTask(db, { title: 'c', parentId: p.id });
		expect(completeTask(db, p.id, NOW, TZ).completedAt).toBe(NOW.toISOString());
		expect(getTask(db, c.id)?.completedAt).toBeNull();
	});
});

describe('rescheduleTask', () => {
	it('tomorrow keeps 14:00 time', () => {
		const db = createTestDb();
		const t = createTask(db, { title: 'x', dueAt: '2026-11-20T13:00:00Z', dueHasTime: true });
		const r = rescheduleTask(db, t.id, 'tomorrow', NOW, TZ);
		expect(r.dueAt).toBe('2026-11-24T13:00:00.000Z');
		expect(r.dueHasTime).toBe(true);
	});

	it('next_week is next Monday; untimed stays date-only', () => {
		const db = createTestDb();
		const t = createTask(db, { title: 'x' });
		const r = rescheduleTask(db, t.id, 'next_week', NOW, TZ);
		expect(r.dueAt).toBe('2026-11-30T22:59:59.999Z');
		expect(r.dueHasTime).toBe(false);
	});
});

describe('delete / restore / labels', () => {
	it('deleteTask removes it from search_index, with subtasks; restore brings them back', () => {
		const db = createTestDb();
		const p = createTask(db, { title: 'parentword' });
		const c = createTask(db, { title: 'childword', parentId: p.id });
		deleteTask(db, p.id);
		expect(search(db, 'parentword')).toEqual([]);
		expect(search(db, 'childword')).toEqual([]);
		expect(getTask(db, c.id)).toBeUndefined();
		expect(db.all(sql`SELECT 1 FROM audit_log WHERE action = 'task.delete'`)).toHaveLength(1);
		restoreTask(db, p.id);
		expect(search(db, 'parentword')).toEqual([p.id]);
		expect(getTask(db, c.id)).toBeDefined();
	});

	it('rename/delete label keeps the index in sync', () => {
		const db = createTestDb();
		const t = createTask(db, { title: 'x', labelNames: ['old'] });
		renameLabel(db, t.labels[0].id, 'fresh');
		expect(search(db, 'fresh')).toEqual([t.id]);
		expect(search(db, 'old')).toEqual([]);
		deleteLabel(db, t.labels[0].id);
		expect(search(db, 'fresh')).toEqual([]);
		expect(getTask(db, t.id)?.labels).toEqual([]);
	});
	it('mutators throw Task not found for deleted or missing tasks', () => {
		const db = createTestDb();
		const t = createTask(db, { title: 'gone', dueAt: '2026-11-23T15:00:00Z', dueHasTime: true });
		deleteTask(db, t.id);
		const before = db
			.select()
			.from(tasks)
			.all()
			.find((r) => r.id === t.id)!;
		expect(() => completeTask(db, t.id, NOW, TZ)).toThrow('Task not found');
		expect(() => uncompleteTask(db, t.id)).toThrow('Task not found');
		expect(() => rescheduleTask(db, t.id, 'tomorrow', NOW, TZ)).toThrow('Task not found');
		expect(() => updateTask(db, t.id, { title: 'x' })).toThrow('Task not found');
		expect(() => completeTask(db, 'missing', NOW, TZ)).toThrow('Task not found');
		expect(
			db
				.select()
				.from(tasks)
				.all()
				.find((r) => r.id === t.id)
		).toEqual(before);
	});
});

describe('subtask projects', () => {
	it('moving a parent moves its subtasks; subtasks always follow the parent project', () => {
		const db = createTestDb();
		const other = createProject(db, { name: 'Other' });
		const third = createProject(db, { name: 'Third' });
		const p = createTask(db, { title: 'p' });
		const c = createTask(db, { title: 'c', parentId: p.id, projectId: third.id });
		expect(c.projectId).toBe(p.projectId);
		updateTask(db, p.id, { projectId: other.id });
		expect(getTask(db, c.id)?.projectId).toBe(other.id);
		expect(updateTask(db, c.id, { projectId: third.id }).projectId).toBe(other.id);
		const loose = createTask(db, { title: 'loose', projectId: third.id });
		expect(updateTask(db, loose.id, { parentId: p.id }).projectId).toBe(other.id);
	});
});

describe('date-only pinning', () => {
	it('pins date-only dues to end of local day on create, update and reschedule', () => {
		const db = createTestDb();
		const t = createTask(db, { title: 'x', dueAt: '2026-11-25T15:00:00Z' }, { timeZone: TZ });
		expect(t.dueAt).toBe('2026-11-25T22:59:59.999Z');
		const u = updateTask(db, t.id, { dueAt: '2026-11-26T03:00:00Z' }, { timeZone: TZ });
		expect(u.dueAt).toBe('2026-11-26T22:59:59.999Z');
		const r = rescheduleTask(
			db,
			t.id,
			{ dueAt: '2026-11-27T09:00:00Z', dueHasTime: false },
			NOW,
			TZ
		);
		expect(r.dueAt).toBe('2026-11-27T22:59:59.999Z');
		const timed = rescheduleTask(
			db,
			t.id,
			{ dueAt: '2026-11-27T09:00:00Z', dueHasTime: true },
			NOW,
			TZ
		);
		expect(timed.dueAt).toBe('2026-11-27T09:00:00.000Z');
	});
});

describe('counts and checklist clearing', () => {
	it('countOpenByProject/Label count open top-level tasks only, grouped', () => {
		const db = createTestDb();
		const p = createProject(db, { name: 'Counted' });
		const a = createTask(db, { title: 'a', projectId: p.id, labelNames: ['l'] });
		const b = createTask(db, { title: 'b', projectId: p.id });
		createTask(db, { title: 'sub', parentId: a.id });
		createTask(db, { title: 'c', projectId: p.id });
		const gone = createTask(db, { title: 'gone', projectId: p.id });
		completeTask(db, b.id, NOW, TZ);
		deleteTask(db, gone.id);
		const inbox = createTask(db, { title: 'in' });
		expect(countOpenByProject(db)).toEqual({ [p.id]: 2, [inbox.projectId]: 1 });
		expect(countOpenByLabel(db)).toEqual({ [a.labels[0].id]: 1 });
	});

	it('clearCompleted soft-deletes done tasks of that project only; restore brings them back', () => {
		const db = createTestDb();
		const p = createProject(db, { name: 'List' });
		const done = createTask(db, { title: 'done', projectId: p.id });
		const open = createTask(db, { title: 'open', projectId: p.id });
		const other = createTask(db, { title: 'other done' });
		completeTask(db, done.id, NOW, TZ);
		completeTask(db, other.id, NOW, TZ);
		expect(listDoneByProject(db, p.id).map((t) => t.id)).toEqual([done.id]);
		expect(clearCompleted(db, p.id)).toEqual([done.id]);
		expect(getTask(db, done.id)).toBeUndefined();
		expect(getTask(db, open.id)).toBeDefined();
		expect(getTask(db, other.id)).toBeDefined();
		restoreTask(db, done.id);
		expect(listDoneByProject(db, p.id).map((t) => t.id)).toEqual([done.id]);
	});

	it('updateLabel renames and recolours, validating both', () => {
		const db = createTestDb();
		const t = createTask(db, { title: 'x', labelNames: ['one', 'two'] });
		const [one, two] = t.labels;
		updateLabel(db, one.id, { name: 'uno', color: '#5B9BD5' });
		expect(getTask(db, t.id)?.labels.find((l) => l.id === one.id)).toMatchObject({
			name: 'uno',
			color: '#5B9BD5'
		});
		expect(() => updateLabel(db, one.id, { name: 'TWO', color: '' })).toThrow('already exists');
		expect(() => updateLabel(db, one.id, { name: 'x'.repeat(41), color: '' })).toThrow('too long');
		expect(() => updateLabel(db, two.id, { name: 'two', color: '#000000' })).toThrow('colour');
		expect(() => updateLabel(db, 'nope', { name: 'q', color: '' })).toThrow('not found');
		updateLabel(db, one.id, { name: 'uno', color: '' });
		expect(getTask(db, t.id)?.labels.find((l) => l.id === one.id)?.color).toBeNull();
	});
});
