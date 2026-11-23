import { getDb } from '../../lib/server/db';
import { taskPageData } from '../../lib/server/task-form';
import { searchAll } from '../../lib/server/services/search';
import { getTask } from '../../lib/server/services/tasks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const db = getDb();
	const page = taskPageData(locals.user!);
	const q = (url.searchParams.get('q') ?? '').slice(0, 200);
	const results = searchAll(db, q, 50, { timeZone: page.timeZone, now: new Date(page.now) });
	return {
		...page,
		q,
		results,
		// full rows so a tapped task opens its sheet in place
		taskRows: results.tasks.flatMap((h) => getTask(db, h.id) ?? [])
	};
};
