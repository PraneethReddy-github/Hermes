import { redirect } from '@sveltejs/kit';
import { getDb } from '../../lib/server/db';
import { audit } from '../../lib/server/audit';
import { SESSION_COOKIE, revokeSession } from '../../lib/server/auth/sessions';
import type { Actions } from './$types';

export const actions: Actions = {
	default: ({ locals, cookies }) => {
		const db = getDb();
		if (locals.sessionId) revokeSession(db, locals.sessionId);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		if (locals.user) audit(db, locals.user.username, 'auth.logout', 'user', locals.user.id);
		redirect(303, '/login');
	}
};
