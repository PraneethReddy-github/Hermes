import { getDb } from '../../../lib/server/db';
import { taskPageData } from '../../../lib/server/task-form';
import { listUpcoming } from '../../../lib/server/services/tasks';
import { localDayKey } from '../../../lib/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const base = taskPageData(locals.user!);
	const now = new Date(base.now);
	return {
		...base,
		today: localDayKey(base.now, base.timeZone),
		groups: listUpcoming(getDb(), now, base.timeZone)
	};
};
