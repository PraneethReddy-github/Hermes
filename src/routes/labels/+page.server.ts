import { getDb } from '../../lib/server/db';
import { field } from '../../lib/server/form';
import { guarded } from '../../lib/server/task-form';
import { deleteLabel, listLabels, updateLabel } from '../../lib/server/services/labels';
import { countOpenByLabel } from '../../lib/server/services/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const db = getDb();
	const counts = countOpenByLabel(db);
	return {
		labels: listLabels(db).map((l) => ({
			id: l.id,
			name: l.name,
			color: l.color,
			open: counts[l.id] ?? 0
		}))
	};
};

export const actions: Actions = {
	update: async ({ request }) => {
		const f = await request.formData();
		return guarded(() => {
			updateLabel(getDb(), field(f, 'id'), { name: field(f, 'name'), color: field(f, 'color') });
			return {};
		});
	},
	delete: async ({ request }) => {
		const id = field(await request.formData(), 'id');
		return guarded(() => {
			deleteLabel(getDb(), id);
			return {};
		});
	}
};
