import { fail } from '@sveltejs/kit';
import type { Priority, TaskInput } from '../types';
import { localToIso, startOfLocalDay } from '../time';
import { field } from './form';
import { getDb } from './db';
import { listLabels } from './services/labels';
import { listProjects } from './services/projects';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A real calendar day (YYYY-MM-DD) or ''; anything else is a bad request. */
export function dayField(f: FormData, key: string): string {
	const v = field(f, key).trim();
	if (v && !(DAY.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v)))
		throw new Error('Invalid date');
	return v;
}

/** Task sheet form → patch. Dates and times are local strings, converted with the user's tz. */
export function taskPatchFromForm(f: FormData, tz: string): Partial<TaskInput> {
	const due = dayField(f, 'dueDate');
	const time = field(f, 'dueTime').trim();
	if (time && !TIME.test(time)) throw new Error('Invalid time');
	if (time && !due) throw new Error('Pick a due date for the time');
	const start = dayField(f, 'startDate');
	const est = field(f, 'estimate').trim();
	if (est && !(Number.isInteger(Number(est)) && Number(est) > 0))
		throw new Error('Invalid estimate');
	const repeat = field(f, 'repeat');
	return {
		title: field(f, 'title'),
		notes: field(f, 'notes'),
		projectId: field(f, 'projectId') || undefined,
		priority: Number(field(f, 'priority') || 0) as Priority,
		labelNames: field(f, 'labels').split(','),
		dueAt: due ? localToIso(due, time || null, tz) : null,
		dueHasTime: !!time,
		startAt: start ? startOfLocalDay(start, tz) : null,
		estimateMin: est ? Number(est) : null,
		rrule: repeat === 'custom' ? field(f, 'rrule') : repeat || null
	};
}

/** Services throw plain Errors with user-facing messages; those become a 400, anything else is a real fault. */
export function guarded<T>(fn: () => T): T | ReturnType<typeof fail<{ error: string }>> {
	try {
		return fn();
	} catch (e) {
		if (e instanceof Error && e.name === 'Error') return fail(400, { error: e.message });
		throw e;
	}
}

/** A forged project id would hit a foreign-key error (500); refuse it up front. */
export function assertProject(id: string): void {
	if (!listProjects(getDb()).some((p) => p.id === id)) throw new Error('Project not found');
}

/** What every task list page needs besides its tasks. */
export function taskPageData(user: { timezone: string }) {
	const db = getDb();
	return {
		timeZone: user.timezone,
		now: new Date().toISOString(),
		projects: listProjects(db).map(({ id, name, kind }) => ({ id, name, kind })),
		labelNames: listLabels(db).map((l) => l.name)
	};
}
