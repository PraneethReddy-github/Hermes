import { error } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db';
import { taskPageData } from '../../../lib/server/task-form';
import { listLabels } from '../../../lib/server/services/labels';
import { listByLabel } from '../../../lib/server/services/tasks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const db = getDb();
	const label = listLabels(db).find((l) => l.id === params.id);
	if (!label) error(404, 'Label not found');
	return {
		...taskPageData(locals.user!),
		label: { id: label.id, name: label.name },
		tasks: listByLabel(db, label.id)
	};
};
