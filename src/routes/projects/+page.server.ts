import { getDb } from '../../lib/server/db';
import { field } from '../../lib/server/form';
import { guarded } from '../../lib/server/task-form';
import {
	archiveProject,
	createProject,
	deleteProject,
	listProjects,
	unarchiveProject,
	updateProject
} from '../../lib/server/services/projects';
import { countOpenByProject } from '../../lib/server/services/tasks';
import type { ProjectKind } from '../../lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const db = getDb();
	const counts = countOpenByProject(db);
	return {
		projects: listProjects(db, { includeArchived: true }).map((p) => ({
			id: p.id,
			name: p.name,
			color: p.color,
			kind: p.kind,
			archived: p.archived,
			isDefault: p.isDefault,
			open: counts[p.id] ?? 0
		}))
	};
};

const idOf = async (request: Request) => field(await request.formData(), 'id');

export const actions: Actions = {
	create: async ({ request }) => {
		const f = await request.formData();
		return guarded(() => {
			createProject(getDb(), {
				name: field(f, 'name'),
				color: field(f, 'color'),
				kind: field(f, 'kind') as ProjectKind // validated by the service
			});
			return {};
		});
	},
	update: async ({ request }) => {
		const f = await request.formData();
		return guarded(() => {
			updateProject(getDb(), field(f, 'id'), { name: field(f, 'name'), color: field(f, 'color') });
			return {};
		});
	},
	archive: async ({ request }) => {
		const id = await idOf(request);
		return guarded(() => (archiveProject(getDb(), id), {}));
	},
	unarchive: async ({ request }) => {
		const id = await idOf(request);
		return guarded(() => (unarchiveProject(getDb(), id), {}));
	},
	delete: async ({ request }) => {
		const id = await idOf(request);
		return guarded(() => (deleteProject(getDb(), id), {}));
	}
};
