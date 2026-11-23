// Actions only: every task list posts here (`/tasks/<id>?/complete`). GET has no page.
import { actionOnlyLoad } from '../../../lib/server/auth/guard';
import { getDb } from '../../../lib/server/db';
import { field } from '../../../lib/server/form';
import { assertProject, dayField, guarded, taskPatchFromForm } from '../../../lib/server/task-form';
import {
	completeTask,
	createTask,
	deleteTask,
	getTask,
	rescheduleTask,
	restoreTask,
	uncompleteTask,
	updateTask
} from '../../../lib/server/services/tasks';
import { localTime, localToIso } from '../../../lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = actionOnlyLoad;

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const f = await request.formData();
		const timeZone = locals.user!.timezone;
		return guarded(() => {
			const patch = taskPatchFromForm(f, timeZone);
			if (patch.projectId) assertProject(patch.projectId);
			updateTask(getDb(), params.id, patch, { timeZone });
			return {};
		});
	},
	complete: ({ params, locals }) =>
		guarded(() => {
			completeTask(getDb(), params.id, new Date(), locals.user!.timezone);
			return {};
		}),
	uncomplete: ({ params }) =>
		guarded(() => {
			uncompleteTask(getDb(), params.id);
			return {};
		}),
	reschedule: async ({ request, params, locals }) => {
		const to = field(await request.formData(), 'to');
		const tz = locals.user!.timezone;
		return guarded(() => {
			const db = getDb();
			if (to === 'today' || to === 'tomorrow' || to === 'next_week')
				rescheduleTask(db, params.id, to, new Date(), tz);
			else {
				const f = new FormData();
				f.set('d', to);
				const day = dayField(f, 'd');
				if (!day) throw new Error('Pick a date');
				const t = getTask(db, params.id);
				const time = t?.dueAt && t.dueHasTime ? localTime(t.dueAt, tz) : null; // keep the time of day
				rescheduleTask(
					db,
					params.id,
					{ dueAt: localToIso(day, time, tz), dueHasTime: !!time },
					new Date(),
					tz
				);
			}
			return {};
		});
	},
	delete: ({ params }) =>
		guarded(() => {
			deleteTask(getDb(), params.id);
			return {};
		}),
	restore: ({ params }) =>
		guarded(() => {
			restoreTask(getDb(), params.id);
			return {};
		}),
	addSubtask: async ({ request, params, locals }) => {
		const title = field(await request.formData(), 'title');
		return guarded(() => {
			createTask(getDb(), { title, parentId: params.id }, { timeZone: locals.user!.timezone });
			return {};
		});
	}
};
