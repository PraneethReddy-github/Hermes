import { eq } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { getDb } from './lib/server/db';
import { startJobs } from './lib/server/jobs';
import { users } from './lib/server/db/schema';
import { parseTheme } from './lib/theme';
import { decideRoute } from './lib/server/auth/guard';
import { SESSION_COOKIE, sessionCookieOptions, validateSession } from './lib/server/auth/sessions';

// Runs once when the server starts; never during `vite build` analysis.
export const init: ServerInit = () => {
	if (!building) startJobs(getDb());
};

export const handle: Handle = async ({ event, resolve }) => {
	const db = getDb();
	event.locals.user = null;
	event.locals.sessionId = null;
	event.locals.theme = 'system';

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const s = validateSession(db, token);
		if (s) {
			event.locals.user = s.user;
			event.locals.sessionId = s.session.id;
			event.locals.theme = parseTheme(
				db.select({ s: users.settingsJson }).from(users).where(eq(users.id, s.user.id)).get()?.s
			);
			// Keep the cookie's lifetime in step with the sliding session expiry.
			event.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	const d = decideRoute({
		path: event.url.pathname,
		search: event.url.search,
		method: event.request.method,
		accept: event.request.headers.get('accept') ?? '',
		hasUser: event.locals.user !== null,
		// A valid session implies a user exists; only query when there is none.
		userExists:
			event.locals.user !== null || !!db.select({ id: users.id }).from(users).limit(1).get(),
		referer: event.request.headers.get('referer')
	});
	if (d.kind === 'redirect') redirect(303, d.location);
	if (d.kind === 'status') return new Response(null, { status: d.status });
	const res = await resolve(event, {
		// Set before first paint so there is no theme flash.
		transformPageChunk: ({ html }) =>
			html.replace('data-theme="system"', `data-theme="${event.locals.theme}"`)
	});
	res.headers.set('X-Content-Type-Options', 'nosniff');
	res.headers.set('Referrer-Policy', 'same-origin');
	res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return res;
};
