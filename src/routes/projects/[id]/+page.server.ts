import { error } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db';
import { field } from '../../../lib/server/form';
import { assertProject, guarded, taskPageData } from '../../../lib/server/task-form';
import { listProjects } from '../../../lib/server/services/projects';
import {
	clearCompleted,
	createTask,
	listByProject,
	listDoneByProject,
	reorderTasks,
	restoreTask
} from '../../../lib/server/services/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const db = getDb();
	const project = listProjects(db, { includeArchived: true }).find((p) => p.id === params.id);
	if (!project) error(404, 'Project not found');
	return {
		...taskPageData(locals.user!),
		project: { id: project.id, name: project.name, kind: project.kind },
		tasks: listByProject(db, project.id),
		done: project.kind === 'checklist' ? listDoneByProject(db, project.id) : []
	};
};

export const actions: Actions = {
	// Checklist add: the text is the title, no quick-add parsing.
	add: async ({ request, params, locals }) => {
		const title = field(await request.formData(), 'title');
		return guarded(() => {
			assertProject(params.id);
			createTask(getDb(), { title, projectId: params.id }, { timeZone: locals.user!.timezone });
			return {};
		});
	},
	clearDone: ({ params }) => guarded(() => ({ cleared: clearCompleted(getDb(), params.id) })),
	restoreMany: ({ url }) =>
		guarded(() => {
			for (const id of (url.searchParams.get('ids') ?? '').split(',').filter(Boolean))
				restoreTask(getDb(), id);
			return {};
		}),
	reorder: async ({ request, params }) => {
		const ids = field(await request.formData(), 'ids')
			.split(',')
			.filter(Boolean);
		return guarded(() => {
			reorderTasks(getDb(), params.id, ids);
			return {};
		});
	}
};
