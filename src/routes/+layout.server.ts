import { getDb } from '../lib/server/db';
import { listProjects } from '../lib/server/services/projects';
import type { LayoutServerLoad } from './$types';

// /offline is precached by the service worker, so it must carry no per-user data.
export const load: LayoutServerLoad = ({ locals, url }) =>
	url.pathname === '/offline'
		? { signedIn: false, theme: 'system' as const, capture: null }
		: {
				signedIn: locals.user !== null,
				theme: locals.theme,
				// what the capture sheet needs to classify as you type
				capture: locals.user
					? {
							timeZone: locals.user.timezone,
							projectNames: listProjects(getDb()).map((p) => p.name)
						}
					: null
			};
