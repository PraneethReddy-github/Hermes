import { getDb } from '../../../lib/server/db';
import { listLabels } from '../../../lib/server/services/labels';
import { listProjects } from '../../../lib/server/services/projects';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	projects: listProjects(getDb()).map(({ id, name }) => ({ id, name })),
	labels: listLabels(getDb()).map(({ id, name }) => ({ id, name }))
});
