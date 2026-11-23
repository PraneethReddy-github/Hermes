import { timingSafeEqual } from 'node:crypto';
import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '../../lib/server/db';
import { users } from '../../lib/server/db/schema';
import { audit } from '../../lib/server/audit';
import { hashPassword } from '../../lib/server/auth/password';
import { clientIp, limiter } from '../../lib/server/auth/rate-limit';
import {
	SESSION_COOKIE,
	createSession,
	sessionCookieOptions
} from '../../lib/server/auth/sessions';
import { getSetupToken } from '../../lib/server/auth/setup-token';
import { field } from '../../lib/server/form';
import { TIMEZONES } from '../../lib/timezones';
import type { Actions, PageServerLoad } from './$types';

const timezones = TIMEZONES;

const sameToken = (a: string, b: string) => {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
};

export const load: PageServerLoad = () => {
	if (getSetupToken(getDb()) === null) error(404);
	return { timezones };
};

export const actions: Actions = {
	default: async (event) => {
		const db = getDb();
		const expected = getSetupToken(db);
		if (expected === null) error(404);

		const f = await event.request.formData();
		const str = (k: string) => field(f, k);
		const username = str('username').trim();
		const timezone = str('timezone');
		const password = str('password');
		const keep = { username, timezone };

		const key = `setup:${clientIp(event)}`;
		const { allowed, retryAfterSec } = limiter.check(key);
		if (!allowed)
			return fail(429, {
				...keep,
				error: `Too many attempts. Try again in ${Math.ceil(retryAfterSec / 60)} min`
			});

		// Reserve the failure up front; cleared on success.
		if (!sameToken(str('token'), expected)) {
			limiter.fail(key);
			return fail(400, { ...keep, error: 'Invalid setup token' });
		}
		if (!username || username.length > 64)
			return fail(400, { ...keep, error: 'Enter a username (max 64 characters)' });
		if (password.length < 12)
			return fail(400, { ...keep, error: 'Password must be at least 12 characters' });
		if (password !== str('confirm')) return fail(400, { ...keep, error: 'Passwords do not match' });
		if (!timezones.includes(timezone)) return fail(400, { ...keep, error: 'Choose a timezone' });

		const passwordHash = await hashPassword(password);
		// Re-check after the await: another request may have created the user meanwhile.
		if (getSetupToken(db) === null) error(404);
		const user = db.insert(users).values({ username, passwordHash, timezone }).returning().get();

		const { token, expiresAt } = createSession(
			db,
			user.id,
			event.request.headers.get('user-agent')
		);
		event.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions, expires: expiresAt });
		audit(db, username, 'auth.setup', 'user', user.id);
		limiter.reset(key);
		redirect(303, '/');
	}
};
