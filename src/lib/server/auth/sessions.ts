import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { dev } from '$app/env';
import type { Db } from '../db';
import { nowIso } from '../db/ids';
import { sessions, users } from '../db/schema';

export const SESSION_COOKIE = 'hermes_session';
const DAY_MS = 86_400_000;
const LIFETIME_MS = 30 * DAY_MS;
const EXTEND_BELOW_MS = 15 * DAY_MS;
const SEEN_STALE_MS = 60_000;

export const sessionCookieOptions = {
	path: '/',
	httpOnly: true,
	secure: !dev,
	sameSite: 'lax',
	maxAge: LIFETIME_MS / 1000
} as const;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(
	db: Db,
	userId: string,
	userAgent: string | null
): { token: string; expiresAt: Date } {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + LIFETIME_MS);
	db.insert(sessions)
		.values({
			id: hashToken(token),
			userId,
			userAgent,
			expiresAt: expiresAt.toISOString()
		})
		.run();
	return { token, expiresAt };
}

export function validateSession(db: Db, token: string) {
	const id = hashToken(token);
	const row = db
		.select({
			session: sessions,
			user: { id: users.id, username: users.username, timezone: users.timezone }
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return null;

	const now = Date.now();
	let expiresAt = new Date(row.session.expiresAt);
	if (expiresAt.getTime() <= now) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}
	const extend = expiresAt.getTime() - now < EXTEND_BELOW_MS;
	if (extend) expiresAt = new Date(now + LIFETIME_MS);
	// Avoid a DB write on every request: only touch the row when something is stale.
	if (extend || now - Date.parse(row.session.lastSeenAt) > SEEN_STALE_MS)
		db.update(sessions)
			.set({ expiresAt: expiresAt.toISOString(), lastSeenAt: nowIso() })
			.where(eq(sessions.id, id))
			.run();
	return { user: row.user, session: { id, userId: row.user.id, expiresAt } };
}

export function revokeSession(db: Db, sessionId: string): void {
	db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function listSessions(db: Db, userId: string) {
	return db.select().from(sessions).where(eq(sessions.userId, userId)).all();
}
