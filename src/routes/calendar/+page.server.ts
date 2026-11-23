import { getDb } from '../../lib/server/db';
import { eventPatchFromForm } from '../../lib/server/event-form';
import { createEvent, getEvent, listOccurrences } from '../../lib/server/services/events';
import { getUserSettings } from '../../lib/server/services/settings';
import { listTasksInRange } from '../../lib/server/services/tasks';
import { guarded, taskPageData } from '../../lib/server/task-form';
import {
	AGENDA_DAYS,
	MAX_AGENDA_DAYS,
	VIEWS,
	isDay,
	rangeDays,
	type View
} from '../../lib/calendar';
import { addLocalDays, localDayKey, startOfLocalDay } from '../../lib/time';
import type { EventInput } from '../../lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const db = getDb();
	const base = taskPageData(locals.user!);
	const tz = base.timeZone;
	const { weekStart } = getUserSettings(db);
	const today = localDayKey(base.now, tz);
	const q = url.searchParams;
	const view = (VIEWS as readonly string[]).includes(q.get('view') ?? '')
		? (q.get('view') as View)
		: 'agenda';
	const date = isDay(q.get('date')) ? q.get('date')! : today;
	const asked = Math.round(Number(q.get('days')));
	const agendaDays = Math.min(MAX_AGENDA_DAYS, Math.max(AGENDA_DAYS, asked || AGENDA_DAYS));
	const days = rangeDays(view, date, weekStart, agendaDays);
	const [from, to] = [
		startOfLocalDay(days[0], tz),
		startOfLocalDay(addLocalDays(days.at(-1)!, 1), tz)
	];
	const occurrences = listOccurrences(db, from, to, tz);
	// Occurrences do not carry notes or the repeat rule; the edit sheet needs them.
	const details: Record<string, { notes: string; rrule: string | null }> = {};
	for (const o of occurrences) {
		const e = details[o.eventId] ? undefined : getEvent(db, o.eventId);
		if (e) details[o.eventId] = { notes: e.notes, rrule: e.rrule };
	}
	return {
		...base,
		view,
		date,
		today,
		weekStart,
		days,
		agendaDays,
		occurrences,
		details,
		tasks: listTasksInRange(db, from, to)
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const f = await request.formData();
		const tz = locals.user!.timezone;
		return guarded(() => {
			createEvent(getDb(), { title: '', ...eventPatchFromForm(f, tz, 'all') } as EventInput, tz);
			return {};
		});
	}
};
