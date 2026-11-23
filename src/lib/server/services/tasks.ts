import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { TZDate } from '@date-fns/tz';
import rrulePkg from 'rrule'; // CJS package: named import fails in plain Node ESM
import type { Db } from '../db';
import { labels, taskCompletions, taskLabels, tasks } from '../db/schema';
import { audit } from '../audit';
import { reindexTask, removeEntity } from '../search-index';
import { parseQuickAdd } from '../../quickadd/parse';
import { nextOccurrenceAfter } from '../../recurrence';
import { addLocalDays, endOfLocalDay, localDayKey, startOfLocalDay } from '../../time';
import type { TaskInput } from '../../types';
import { ensureLabels } from './labels';
import { getInboxId, listProjects } from './projects';
import { getUserSettings } from './settings';

const { RRule } = rrulePkg;

type Row = typeof tasks.$inferSelect;
export type Task = Row & {
	labels: { id: string; name: string; color: string | null }[];
	subtasks?: Task[];
};
export interface Ctx {
	now?: Date;
	timeZone?: string;
}

const MAX_TITLE = 500;
const FREQS = [RRule.DAILY, RRule.WEEKLY, RRule.MONTHLY, RRule.YEARLY];
const iso = (v: string | Date) => new Date(v).toISOString();

/** Trust boundary: non-empty, parseable, FREQ one of DAILY/WEEKLY/MONTHLY/YEARLY. */
export function validateRrule(rrule: string): void {
	try {
		if (!rrule.trim()) throw new Error();
		const opts = RRule.parseString(rrule);
		if (opts.freq === undefined || !FREQS.includes(opts.freq)) throw new Error();
		new RRule(opts);
	} catch {
		throw new Error('Invalid repeat rule');
	}
}

function checkFields(p: { title?: string; priority?: number }): void {
	if (p.title !== undefined) {
		if (p.title.trim() === '') throw new Error('Add a title');
		if (p.title.trim().length > MAX_TITLE) throw new Error(`Title too long (max ${MAX_TITLE})`);
	}
	if (
		p.priority !== undefined &&
		!(Number.isInteger(p.priority) && p.priority >= 0 && p.priority <= 4)
	)
		throw new Error('Invalid priority');
}

// date-only dues sit at end of the local day; rrule drops milliseconds, so re-pin
const pinDue = (due: string, hasTime: boolean, tz: string) =>
	hasTime ? due : endOfLocalDay(localDayKey(due, tz), tz);

/** A repeating task needs a due date; BYDAY rules snap a non-matching due forward to the first occurrence. */
function normalizeSchedule(
	rrule: string | null,
	dueAt: string | null,
	dueHasTime: boolean,
	now: Date,
	tz: string
): { dueAt: string | null; dueHasTime: boolean } {
	if (!rrule) return { dueAt: dueAt && pinDue(dueAt, dueHasTime, tz), dueHasTime };
	if (!dueAt) {
		const today = localDayKey(now.toISOString(), tz);
		const start = new Date(new Date(startOfLocalDay(today, tz)).getTime() - 1).toISOString();
		const first = nextOccurrenceAfter(rrule, endOfLocalDay(today, tz), start, tz);
		return { dueAt: first && pinDue(first, false, tz), dueHasTime: false };
	}
	if (/BYDAY=/i.test(rrule)) {
		const snapped = nextOccurrenceAfter(
			rrule,
			dueAt,
			new Date(new Date(dueAt).getTime() - 1).toISOString(),
			tz
		);
		if (snapped) return { dueAt: pinDue(snapped, dueHasTime, tz), dueHasTime };
	}
	return { dueAt: pinDue(dueAt, dueHasTime, tz), dueHasTime };
}

function hydrate(db: Db, rows: Row[], withSubtasks = true): Task[] {
	if (!rows.length) return [];
	const ids = rows.map((r) => r.id);
	const lbl = db
		.select({ taskId: taskLabels.taskId, id: labels.id, name: labels.name, color: labels.color })
		.from(taskLabels)
		.innerJoin(labels, eq(labels.id, taskLabels.labelId))
		.where(inArray(taskLabels.taskId, ids))
		.all()
		.sort((a, b) => a.name.localeCompare(b.name));
	const subs = withSubtasks
		? hydrate(
				db,
				db
					.select()
					.from(tasks)
					.where(and(inArray(tasks.parentId, ids), isNull(tasks.deletedAt)))
					.all(),
				false
			).sort(compare)
		: [];
	return rows.map((r) => ({
		...r,
		labels: lbl
			.filter((l) => l.taskId === r.id)
			.map(({ id, name, color }) => ({ id, name, color })),
		...(withSubtasks && { subtasks: subs.filter((s) => s.parentId === r.id) })
	}));
}

/** Overdue first falls out of dueAt asc; undated last, then priority desc, then position. */
function compare(a: Row, b: Row): number {
	if (a.dueAt !== b.dueAt) {
		if (!a.dueAt) return 1;
		if (!b.dueAt) return -1;
		return a.dueAt < b.dueAt ? -1 : 1;
	}
	return b.priority - a.priority || a.position - b.position;
}

const open = and(isNull(tasks.deletedAt), isNull(tasks.completedAt));
const sorted = (rows: Row[]) => rows.sort(compare);

function row(db: Db, id: string): Row {
	const r = db.select().from(tasks).where(eq(tasks.id, id)).get();
	if (!r) throw new Error('Task not found');
	return r;
}

/** Existing, non-deleted task or 'Task not found'. */
function live(db: Db, id: string): Row {
	const r = row(db, id);
	if (r.deletedAt) throw new Error('Task not found');
	return r;
}

const fresh = (db: Db, id: string): Task => hydrate(db, [row(db, id)])[0];

function checkParent(db: Db, id: string | null, parentId: string): void {
	const parent = row(db, parentId);
	if (parent.deletedAt) throw new Error('Task not found');
	if (parent.parentId || parentId === id) throw new Error('Subtasks cannot be nested');
	if (id && db.select({ id: tasks.id }).from(tasks).where(eq(tasks.parentId, id)).get())
		throw new Error('Subtasks cannot be nested');
}

function setLabels(db: Db, taskId: string, names: string[]): void {
	db.delete(taskLabels).where(eq(taskLabels.taskId, taskId)).run();
	const ids = ensureLabels(db, names);
	if (ids.length)
		db.insert(taskLabels)
			.values(ids.map((labelId) => ({ taskId, labelId })))
			.run();
}

export function getTask(db: Db, id: string): Task | undefined {
	const r = db
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
		.get();
	return r && hydrate(db, [r])[0];
}

export function createTask(db: Db, input: TaskInput, ctx: Ctx = {}): Task {
	checkFields(input);
	if (input.rrule !== undefined && input.rrule !== null) validateRrule(input.rrule);
	const now = ctx.now ?? new Date();
	const tz = ctx.timeZone ?? getUserSettings(db).timezone;
	const id = db.transaction(() => {
		if (input.parentId) checkParent(db, null, input.parentId);
		// a subtask always lives in its parent's project
		const projectId = input.parentId
			? row(db, input.parentId).projectId
			: (input.projectId ?? getInboxId(db));
		const sched = normalizeSchedule(
			input.rrule ?? null,
			input.dueAt ? iso(input.dueAt) : null,
			input.dueHasTime ?? false,
			now,
			tz
		);
		const max = db
			.select({ m: sql<number>`coalesce(max(${tasks.position}), -1)` })
			.from(tasks)
			.where(eq(tasks.projectId, projectId))
			.get()!.m;
		const created = db
			.insert(tasks)
			.values({
				projectId,
				parentId: input.parentId ?? null,
				title: input.title.trim(),
				notes: input.notes ?? '',
				priority: input.priority ?? 0,
				...sched,
				startAt: input.startAt ? iso(input.startAt) : null,
				estimateMin: input.estimateMin ?? null,
				rrule: input.rrule ?? null,
				position: max + 1
			})
			.returning({ id: tasks.id })
			.get().id;
		setLabels(db, created, input.labelNames ?? []);
		reindexTask(db, created);
		return created;
	});
	return fresh(db, id);
}

export function createTaskFromQuickAdd(
	db: Db,
	text: string,
	ctx: { now: Date; timeZone: string; defaultProjectId?: string }
): Task {
	const projects = listProjects(db);
	const p = parseQuickAdd(text, {
		now: ctx.now,
		timeZone: ctx.timeZone,
		projectNames: projects.map((x) => x.name)
	});
	if (!p.title.trim()) throw new Error('Add a title');
	const projectId =
		projects.find((x) => x.name.toLowerCase() === p.projectName?.toLowerCase())?.id ??
		ctx.defaultProjectId ??
		getInboxId(db);
	return createTask(
		db,
		{
			title: p.title,
			priority: p.priority,
			labelNames: p.labels,
			projectId,
			dueAt: p.dueAt,
			dueHasTime: p.dueHasTime,
			rrule: p.rrule,
			estimateMin: p.estimateMin
		},
		ctx
	);
}

export function updateTask(db: Db, id: string, patch: Partial<TaskInput>, ctx: Ctx = {}): Task {
	checkFields(patch);
	if (patch.rrule) validateRrule(patch.rrule);
	else if (patch.rrule === '') throw new Error('Invalid repeat rule');
	const now = ctx.now ?? new Date();
	const tz = ctx.timeZone ?? getUserSettings(db).timezone;
	db.transaction(() => {
		const cur = live(db, id);
		if (patch.parentId) checkParent(db, id, patch.parentId);
		const set: Partial<Row> = {};
		if (patch.title !== undefined) set.title = patch.title.trim();
		if (patch.notes !== undefined) set.notes = patch.notes;
		if (patch.parentId !== undefined) set.parentId = patch.parentId;
		const parentId = patch.parentId === undefined ? cur.parentId : patch.parentId;
		// a subtask always lives in its parent's project
		if (parentId && (patch.parentId !== undefined || patch.projectId !== undefined))
			set.projectId = row(db, parentId).projectId;
		else if (!parentId && patch.projectId !== undefined) set.projectId = patch.projectId;
		if (patch.priority !== undefined) set.priority = patch.priority;
		if (patch.startAt !== undefined) set.startAt = patch.startAt && iso(patch.startAt);
		if (patch.estimateMin !== undefined) set.estimateMin = patch.estimateMin;
		if (patch.rrule !== undefined) set.rrule = patch.rrule;
		if (patch.rrule !== undefined || patch.dueAt !== undefined || patch.dueHasTime !== undefined) {
			const dueAt = patch.dueAt === undefined ? cur.dueAt : patch.dueAt && iso(patch.dueAt);
			const hasTime = dueAt ? (patch.dueHasTime ?? cur.dueHasTime) : false;
			Object.assign(
				set,
				normalizeSchedule(
					patch.rrule === undefined ? cur.rrule : patch.rrule,
					dueAt,
					hasTime,
					now,
					tz
				)
			);
		}
		if (Object.keys(set).length) db.update(tasks).set(set).where(eq(tasks.id, id)).run();
		if (!parentId && set.projectId !== undefined)
			db.update(tasks)
				.set({ projectId: set.projectId })
				.where(and(eq(tasks.parentId, id), isNull(tasks.deletedAt)))
				.run();
		if (patch.labelNames) setLabels(db, id, patch.labelNames);
		reindexTask(db, id);
	});
	return fresh(db, id);
}

const subtaskIds = (db: Db, id: string, deleted: boolean, at?: string | null) =>
	db
		.select({ id: tasks.id })
		.from(tasks)
		.where(
			and(eq(tasks.parentId, id), deleted ? eq(tasks.deletedAt, at!) : isNull(tasks.deletedAt))
		)
		.all()
		.map((r) => r.id);

export function deleteTask(db: Db, id: string): void {
	db.transaction(() => {
		const t = row(db, id);
		if (t.deletedAt) return;
		const at = new Date().toISOString();
		const all = [id, ...subtaskIds(db, id, false)];
		db.update(tasks).set({ deletedAt: at }).where(inArray(tasks.id, all)).run();
		all.forEach((i) => removeEntity(db, 'task', i));
		audit(db, 'user', 'task.delete', 'task', id, { subtasks: all.length - 1 });
	});
}

export function restoreTask(db: Db, id: string): Task {
	db.transaction(() => {
		const t = row(db, id);
		if (!t.deletedAt) return;
		// only subtasks deleted together with the parent come back
		const all = [id, ...subtaskIds(db, id, true, t.deletedAt)];
		db.update(tasks).set({ deletedAt: null }).where(inArray(tasks.id, all)).run();
		all.forEach((i) => reindexTask(db, i));
		audit(db, 'user', 'task.restore', 'task', id);
	});
	return fresh(db, id);
}

export function completeTask(db: Db, id: string, now: Date, tz: string): Task {
	db.transaction(() => {
		const t = live(db, id);
		if (t.completedAt) return;
		// shortcut: COUNT restarts each time because dtstart moves to the new due; fine until COUNT rules are exposed in the UI
		// next occurrence after the later of now and the current due; date-only tasks count until end of today
		const floor = t.dueHasTime
			? now.toISOString()
			: endOfLocalDay(localDayKey(now.toISOString(), tz), tz);
		const after = t.dueAt && t.dueAt > floor ? t.dueAt : floor;
		const next = t.rrule && t.dueAt ? nextOccurrenceAfter(t.rrule, t.dueAt, after, tz) : null;
		if (!next) {
			db.update(tasks).set({ completedAt: now.toISOString() }).where(eq(tasks.id, id)).run();
			return;
		}
		const dueAt = pinDue(next, t.dueHasTime, tz);
		db.insert(taskCompletions)
			.values({
				taskId: id,
				completedAt: now.toISOString(),
				prevDueAt: t.dueAt,
				prevStartAt: t.startAt
			})
			.run();
		const startAt = t.startAt
			? new Date(
					new Date(t.startAt).getTime() + new Date(dueAt).getTime() - new Date(t.dueAt!).getTime()
				).toISOString()
			: null;
		db.update(tasks).set({ dueAt, startAt }).where(eq(tasks.id, id)).run();
	});
	return fresh(db, id);
}

/**
 * Undo the last completion. A finished task just reopens; a repeating task that advanced gets its
 * previous due/start back and loses that completion record.
 */
export function uncompleteTask(db: Db, id: string): Task {
	db.transaction(() => {
		const t = live(db, id);
		if (t.completedAt) {
			db.update(tasks).set({ completedAt: null }).where(eq(tasks.id, id)).run();
			return;
		}
		if (!t.rrule) return;
		const last = db
			.select()
			.from(taskCompletions)
			.where(eq(taskCompletions.taskId, id))
			.orderBy(desc(taskCompletions.completedAt), desc(taskCompletions.id))
			.limit(1)
			.get();
		if (!last) return;
		db.update(tasks)
			.set({ dueAt: last.prevDueAt ?? t.dueAt, startAt: last.prevStartAt })
			.where(eq(tasks.id, id))
			.run();
		db.delete(taskCompletions).where(eq(taskCompletions.id, last.id)).run();
	});
	return fresh(db, id);
}

export function rescheduleTask(
	db: Db,
	id: string,
	to: 'today' | 'tomorrow' | 'next_week' | { dueAt: string; dueHasTime: boolean },
	now: Date,
	tz: string
): Task {
	const t = live(db, id);
	let dueAt: string;
	let dueHasTime: boolean;
	if (typeof to === 'object') {
		dueHasTime = to.dueHasTime;
		dueAt = pinDue(iso(to.dueAt), dueHasTime, tz);
	} else {
		const today = localDayKey(now.toISOString(), tz);
		const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
		const day = addLocalDays(today, { today: 0, tomorrow: 1, next_week: (8 - dow) % 7 || 7 }[to]);
		dueHasTime = t.dueHasTime && !!t.dueAt;
		if (dueHasTime) {
			const [y, m, d] = day.split('-').map(Number);
			const c = new TZDate(t.dueAt!, tz);
			dueAt = new Date(
				new TZDate(
					y,
					m - 1,
					d,
					c.getHours(),
					c.getMinutes(),
					c.getSeconds(),
					c.getMilliseconds(),
					tz
				).getTime()
			).toISOString();
		} else dueAt = endOfLocalDay(day, tz);
	}
	db.update(tasks).set({ dueAt, dueHasTime }).where(eq(tasks.id, id)).run();
	return fresh(db, id);
}

export function listToday(db: Db, now: Date, tz: string): Task[] {
	const end = endOfLocalDay(localDayKey(now.toISOString(), tz), tz);
	return hydrate(
		db,
		sorted(
			db
				.select()
				.from(tasks)
				.where(and(open, or(lte(tasks.dueAt, end), lte(tasks.startAt, end))))
				.all()
		)
	);
}

export function listUpcoming(
	db: Db,
	now: Date,
	tz: string,
	days = 14
): { day: string; tasks: Task[] }[] {
	const today = localDayKey(now.toISOString(), tz);
	const from = startOfLocalDay(addLocalDays(today, 1), tz);
	const to = startOfLocalDay(addLocalDays(today, days), tz);
	const list = hydrate(
		db,
		sorted(
			db
				.select()
				.from(tasks)
				.where(and(open, gte(tasks.dueAt, from), lt(tasks.dueAt, to)))
				.all()
		)
	);
	const groups = new Map<string, Task[]>();
	for (const t of list) {
		const day = localDayKey(t.dueAt!, tz);
		groups.set(day, [...(groups.get(day) ?? []), t]);
	}
	return [...groups].map(([day, tasks]) => ({ day, tasks }));
}

/** Open tasks due in [rangeStart, rangeEnd), for the calendar. */
export function listTasksInRange(db: Db, rangeStart: string, rangeEnd: string): Task[] {
	return hydrate(
		db,
		sorted(
			db
				.select()
				.from(tasks)
				.where(and(open, gte(tasks.dueAt, rangeStart), lt(tasks.dueAt, rangeEnd)))
				.all()
		)
	);
}

export function listByProject(db: Db, projectId: string): Task[] {
	return hydrate(
		db,
		sorted(
			db
				.select()
				.from(tasks)
				.where(and(open, eq(tasks.projectId, projectId), isNull(tasks.parentId)))
				.all()
		)
	);
}

/** Open top-level tasks per project id, one grouped query; projects without any are absent. */
export function countOpenByProject(db: Db): Record<string, number> {
	const rows = db
		.select({ id: tasks.projectId, n: sql<number>`count(*)` })
		.from(tasks)
		.where(and(open, isNull(tasks.parentId)))
		.groupBy(tasks.projectId)
		.all();
	return Object.fromEntries(rows.map((r) => [r.id, r.n]));
}

/** Open tasks per label id (same set listByLabel shows). */
export function countOpenByLabel(db: Db): Record<string, number> {
	const rows = db
		.select({ id: taskLabels.labelId, n: sql<number>`count(*)` })
		.from(taskLabels)
		.innerJoin(tasks, eq(tasks.id, taskLabels.taskId))
		.where(open)
		.groupBy(taskLabels.labelId)
		.all();
	return Object.fromEntries(rows.map((r) => [r.id, r.n]));
}

/** Completed top-level tasks of a project, newest first (the checklist's Done group). */
export function listDoneByProject(db: Db, projectId: string): Task[] {
	return hydrate(
		db,
		db
			.select()
			.from(tasks)
			.where(
				and(
					isNull(tasks.deletedAt),
					isNotNull(tasks.completedAt),
					eq(tasks.projectId, projectId),
					isNull(tasks.parentId)
				)
			)
			.orderBy(desc(tasks.completedAt))
			.all()
	);
}

/** Soft-deletes a project's completed tasks; returns their ids so the caller can offer undo. */
export function clearCompleted(db: Db, projectId: string): string[] {
	return db.transaction(() => {
		const ids = listDoneByProject(db, projectId).map((t) => t.id);
		ids.forEach((id) => deleteTask(db, id));
		return ids;
	});
}

export function listByLabel(db: Db, labelId: string): Task[] {
	return hydrate(
		db,
		sorted(
			db
				.select({ t: tasks })
				.from(tasks)
				.innerJoin(taskLabels, eq(taskLabels.taskId, tasks.id))
				.where(and(open, eq(taskLabels.labelId, labelId)))
				.all()
				.map((r) => r.t)
		)
	);
}

export function listCompleted(db: Db, now: Date, days = 30): Task[] {
	const since = new Date(now.getTime() - days * 86400000).toISOString();
	return hydrate(
		db,
		db
			.select()
			.from(tasks)
			.where(
				and(isNull(tasks.deletedAt), isNotNull(tasks.completedAt), gte(tasks.completedAt, since))
			)
			.orderBy(desc(tasks.completedAt))
			.all()
	);
}

/** Positions follow the given order; ids from other projects are ignored. */
export function reorderTasks(db: Db, projectId: string, ids: string[]): void {
	db.transaction(() => {
		ids.forEach((id, position) =>
			db
				.update(tasks)
				.set({ position })
				.where(and(eq(tasks.id, id), eq(tasks.projectId, projectId)))
				.run()
		);
	});
}
