// Actions only: the calendar posts here (`/calendar/events/<id>?/update`). GET has no page.
import { actionOnlyLoad } from '../../../../lib/server/auth/guard';
import { getDb } from '../../../../lib/server/db';
import {
	currentOccurrence,
	eventPatchFromForm,
	scopeField
} from '../../../../lib/server/event-form';
import { field } from '../../../../lib/server/form';
import { deleteEvent, getEvent, updateEvent } from '../../../../lib/server/services/events';
import { guarded } from '../../../../lib/server/task-form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = actionOnlyLoad;

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const f = await request.formData();
		const tz = locals.user!.timezone;
		return guarded(() => {
			const db = getDb();
			const ev = getEvent(db, params.id);
			if (!ev) throw new Error('Event not found');
			const scope = scopeField(f);
			const orig = field(f, 'originalStart');
			const cur = ev.rrule
				? currentOccurrence(db, ev.id, field(f, 'occurrenceStart'), orig, tz)
				: undefined;
			const patch = eventPatchFromForm(f, tz, scope, ev, cur);
			if (cur && scope === 'this' && !Object.keys(patch).length) return {}; // nothing changed
			updateEvent(db, params.id, patch, scope, orig || undefined, tz);
			return {};
		});
	},
	delete: async ({ request, params, locals }) => {
		const f = await request.formData();
		return guarded(() => {
			deleteEvent(
				getDb(),
				params.id,
				scopeField(f),
				field(f, 'originalStart') || undefined,
				locals.user!.timezone
			);
			return {};
		});
	}
};
