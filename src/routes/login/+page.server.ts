import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '../../lib/server/db';
import { users } from '../../lib/server/db/schema';
import { audit } from '../../lib/server/audit';
import { dataKey, decrypt } from '../../lib/server/crypto';
import { safeNext } from '../../lib/server/auth/guard';
import { verifyPassword } from '../../lib/server/auth/password';
import { clientIp, limiter } from '../../lib/server/auth/rate-limit';
import {
	SESSION_COOKIE,
	createSession,
	sessionCookieOptions
} from '../../lib/server/auth/sessions';
import { verifyTotp } from '../../lib/server/auth/totp';
import { field } from '../../lib/server/form';
import type { Actions, PageServerLoad } from './$types';

const BAD = 'Wrong username or password';

export const load: PageServerLoad = ({ locals, url }) => {
	const db = getDb();
	if (!db.select({ id: users.id }).from(users).limit(1).get()) redirect(303, '/setup');
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
	return { next: safeNext(url.searchParams.get('next')) };
};

export const actions: Actions = {
	default: async (event) => {
		const db = getDb();
		const ip = clientIp(event);
		const key = `login:${ip}`;
		const { allowed, retryAfterSec } = limiter.check(key);
		if (!allowed)
			return fail(429, {
				error: `Too many attempts. Try again in ${Math.ceil(retryAfterSec / 60)} min`
			});

		const f = await event.request.formData();
		const username = field(f, 'username').trim();
		const password = field(f, 'password');
		const code = field(f, 'code').trim();
		const next = safeNext(field(f, 'next'));

		// Reserve the failure before the slow argon2 await so parallel guesses all count; cleared on success.
		limiter.fail(key);
		const user = db.select().from(users).where(eq(users.username, username)).get();
		const ok = !!user && (await verifyPassword(user.passwordHash, password));
		const deny = () => {
			audit(db, username || 'anonymous', 'auth.login.fail', 'user', user?.id, { ip });
			return fail(400, { error: BAD, username });
		};
		if (!user || !ok) return deny();

		if (user.totpSecretEnc) {
			// Password is right but the code is still needed; the reserved failure stays until the full login succeeds.
			if (!code) return { needsTotp: true, username };
			if (!verifyTotp(decrypt(user.totpSecretEnc, dataKey()), code)) {
				audit(db, username, 'auth.login.fail', 'user', user.id, { ip, totp: true });
				return fail(400, { error: BAD, needsTotp: true, username });
			}
		}

		const { token, expiresAt } = createSession(
			db,
			user.id,
			event.request.headers.get('user-agent')
		);
		event.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions, expires: expiresAt });
		audit(db, username, 'auth.login.ok', 'user', user.id, { ip });
		limiter.reset(key);
		redirect(303, next);
	}
};
