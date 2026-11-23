import { getDb } from '../../lib/server/db';
import { field } from '../../lib/server/form';
import { assertProject, guarded, taskPageData } from '../../lib/server/task-form';
import { createTaskFromQuickAdd, listToday } from '../../lib/server/services/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const base = taskPageData(locals.user!);
	return { ...base, tasks: listToday(getDb(), new Date(base.now), base.timeZone) };
};

export const actions: Actions = {
	// Also posted to from project pages (`projectId` = that project).
	quickadd: async ({ request, locals }) => {
		const f = await request.formData();
		const db = getDb();
		const projectId = field(f, 'projectId');
		return guarded(() => {
			if (projectId) assertProject(projectId);
			const t = createTaskFromQuickAdd(db, field(f, 'text'), {
				now: new Date(),
				timeZone: locals.user!.timezone,
				defaultProjectId: projectId || undefined
			});
			return { added: t.title };
		});
	}
};
