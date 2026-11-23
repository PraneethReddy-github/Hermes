import { getDb } from '../lib/server/db';
import { listOccurrences } from '../lib/server/services/events';
import { listPinned } from '../lib/server/services/notes';
import { listProjects } from '../lib/server/services/projects';
import { countOpenByProject, listToday, listUpcoming } from '../lib/server/services/tasks';
import { taskPageData } from '../lib/server/task-form';
import { addLocalDays, endOfLocalDay, localDayKey, startOfLocalDay } from '../lib/time';
import type { PageServerLoad } from './$types';

/** "Monday, 23 November" in the user's timezone. */
function dateLabel(now: Date, tz: string): string {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-GB', {
			timeZone: tz,
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		})
			.formatToParts(now)
			.map((x) => [x.type, x.value])
	);
	return `${p.weekday}, ${p.day} ${p.month}`;
}

export const load: PageServerLoad = ({ locals }) => {
	const db = getDb();
	const base = taskPageData(locals.user!);
	const { timeZone: tz } = base;
	const now = new Date(base.now);
	const today = localDayKey(base.now, tz);
	const dayStart = startOfLocalDay(today, tz);

	// Overdue = due before now (same test as TaskRow's red); date-only today ends 23:59:59.999, so it stays
	// in Due today. Started-only and later-due tasks are left out here: they live in Tasks > Today.
	const end = endOfLocalDay(today, tz);
	const todays = listToday(db, now, tz).filter((t) => t.dueAt && t.dueAt <= end);
	const overdue = todays.filter((t) => t.dueAt! < base.now);
	const dueToday = todays.filter((t) => t.dueAt! >= base.now);
	const seen = new Set(todays.map((t) => t.id));
	// The next 3 local days after today (DST-safe: bounds are local midnights).
	const dueSoon = listUpcoming(db, now, tz, 4)
		.flatMap((g) => g.tasks)
		.filter((t) => t.priority >= 3 && !seen.has(t.id));

	const shoppingId = listProjects(db).find((p) => p.name.toLowerCase() === 'shopping')?.id ?? null;
	return {
		...base,
		today,
		dateLabel: dateLabel(now, tz),
		events: listOccurrences(db, dayStart, startOfLocalDay(addLocalDays(today, 1), tz), tz),
		overdue,
		dueToday,
		dueSoon,
		shoppingId,
		shoppingOpen: (shoppingId && countOpenByProject(db)[shoppingId]) || 0,
		pinnedNotes: listPinned(db).slice(0, 3)
	};
};
