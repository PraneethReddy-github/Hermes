import { fail, redirect } from '@sveltejs/kit';
import { and, eq, ne } from 'drizzle-orm';
import QRCode from 'qrcode';
import { getDb } from '../../../lib/server/db';
import { sessions, users } from '../../../lib/server/db/schema';
import { audit } from '../../../lib/server/audit';
import { dataKey, decrypt, encrypt } from '../../../lib/server/crypto';
import { hashPassword, verifyPassword } from '../../../lib/server/auth/password';
import { limiter } from '../../../lib/server/auth/rate-limit';
import { SESSION_COOKIE, listSessions, revokeSession } from '../../../lib/server/auth/sessions';
import { newTotpSecret, totpUri, verifyTotp } from '../../../lib/server/auth/totp';
import { field } from '../../../lib/server/form';
import type { Actions, PageServerLoad } from './$types';

// Re-auth checks (current password, TOTP code) share a per-user budget so a stolen session can't brute-force them.
const budget = (userId: string) => {
	const key = `sec:${userId}`;
	const { allowed, retryAfterSec } = limiter.check(key);
	return {
		key,
		blocked: allowed ? null : `Too many attempts. Try again in ${Math.ceil(retryAfterSec / 60)} min`
	};
};

const me = (userId: string) => getDb().select().from(users).where(eq(users.id, userId)).get()!;

export const load: PageServerLoad = ({ locals }) => ({
	totpEnabled: !!me(locals.user!.id).totpSecretEnc,
	sessions: listSessions(getDb(), locals.user!.id).map((s) => ({
		id: s.id,
		userAgent: s.userAgent,
		lastSeenAt: s.lastSeenAt,
		current: s.id === locals.sessionId
	}))
});

export const actions: Actions = {
	changePassword: async ({ request, locals }) => {
		const db = getDb();
		const user = me(locals.user!.id);
		const b = budget(user.id);
		if (b.blocked) return fail(429, { which: 'password', error: b.blocked });
		const f = await request.formData();
		const next = field(f, 'new');
		limiter.fail(b.key);
		if (!(await verifyPassword(user.passwordHash, field(f, 'current'))))
			return fail(400, { which: 'password', error: 'Current password is wrong' });
		if (next.length < 12)
			return fail(400, { which: 'password', error: 'New password must be at least 12 characters' });
		if (next !== field(f, 'confirm'))
			return fail(400, { which: 'password', error: 'Passwords do not match' });
		limiter.reset(b.key);
		db.update(users)
			.set({ passwordHash: await hashPassword(next) })
			.where(eq(users.id, user.id))
			.run();
		// A changed password should end every other login.
		db.delete(sessions)
			.where(and(eq(sessions.userId, user.id), ne(sessions.id, locals.sessionId!)))
			.run();
		audit(db, user.username, 'auth.password.change', 'user', user.id);
		return { which: 'password', ok: 'Password changed. Other devices were signed out.' };
	},

	startTotp: async ({ locals }) => {
		const secret = newTotpSecret();
		const uri = totpUri(secret, locals.user!.username);
		return { which: 'totp', secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
	},

	enableTotp: async ({ request, locals }) => {
		const db = getDb();
		const user = me(locals.user!.id);
		const f = await request.formData();
		const secret = field(f, 'secret');
		const b = budget(user.id);
		if (b.blocked) return fail(429, { which: 'totp', error: b.blocked });
		if (!/^[A-Z2-7]{32}$/.test(secret)) return fail(400, { which: 'totp', error: 'Start again' });
		if (user.totpSecretEnc) return fail(400, { which: 'totp', error: 'Two-factor is already on' });
		limiter.fail(b.key);
		if (!(await verifyPassword(user.passwordHash, field(f, 'current'))))
			return fail(400, {
				which: 'totp',
				error: 'Current password is wrong',
				secret,
				qr: field(f, 'qr')
			});
		if (!verifyTotp(secret, field(f, 'code')))
			return fail(400, {
				which: 'totp',
				error: 'Wrong code',
				secret,
				qr: field(f, 'qr')
			});
		limiter.reset(b.key);
		db.update(users)
			.set({ totpSecretEnc: encrypt(secret, dataKey()) })
			.where(eq(users.id, user.id))
			.run();
		audit(db, user.username, 'auth.totp.enable', 'user', user.id);
		return { which: 'totp', ok: 'Two-factor authentication is on.' };
	},

	disableTotp: async ({ request, locals }) => {
		const db = getDb();
		const user = me(locals.user!.id);
		const b = budget(user.id);
		if (b.blocked) return fail(429, { which: 'totp', error: b.blocked });
		if (!user.totpSecretEnc)
			return fail(400, { which: 'totp', error: 'Two-factor is not enabled' });
		limiter.fail(b.key);
		const code = field(await request.formData(), 'code');
		if (!verifyTotp(decrypt(user.totpSecretEnc, dataKey()), code))
			return fail(400, { which: 'totp', error: 'Wrong code' });
		limiter.reset(b.key);
		db.update(users).set({ totpSecretEnc: null }).where(eq(users.id, user.id)).run();
		audit(db, user.username, 'auth.totp.disable', 'user', user.id);
		return { which: 'totp', ok: 'Two-factor authentication is off.' };
	},

	revoke: async ({ request, locals, cookies }) => {
		const db = getDb();
		const id = field(await request.formData(), 'id');
		const s = listSessions(db, locals.user!.id).find((x) => x.id === id);
		if (!s) return fail(404, { which: 'sessions', error: 'Session not found' });
		revokeSession(db, id);
		audit(db, locals.user!.username, 'auth.session.revoke', 'session', id);
		if (id === locals.sessionId) {
			cookies.delete(SESSION_COOKIE, { path: '/' });
			redirect(303, '/login');
		}
		return { which: 'sessions', ok: 'Session signed out.' };
	}
};
