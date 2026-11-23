import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../db/test-utils';
import { sessions, users } from '../db/schema';
import { createSession, listSessions, revokeSession, validateSession } from './sessions';

const DAY = 86_400_000;

function setup() {
	const db = createTestDb();
	const user = db.insert(users).values({ username: 'me', passwordHash: 'x' }).returning().get();
	return { db, user };
}

describe('sessions', () => {
	it('create -> validate returns user and session', () => {
		const { db, user } = setup();
		const { token, expiresAt } = createSession(db, user.id, 'ua');
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * DAY);
		const r = validateSession(db, token);
		expect(r?.user).toEqual({ id: user.id, username: 'me', timezone: 'Europe/Berlin' });
		expect(r?.session.id).not.toBe(token); // stored hashed
	});

	it('returns null for unknown token', () => {
		const { db } = setup();
		expect(validateSession(db, 'nope')).toBeNull();
	});

	it('expired session is deleted and returns null', () => {
		const { db, user } = setup();
		const { token } = createSession(db, user.id, null);
		db.update(sessions)
			.set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
			.run();
		expect(validateSession(db, token)).toBeNull();
		expect(db.select().from(sessions).all()).toHaveLength(0);
	});

	it('extends sliding expiry when under 15 days left', () => {
		const { db, user } = setup();
		const { token } = createSession(db, user.id, null);
		db.update(sessions)
			.set({ expiresAt: new Date(Date.now() + 10 * DAY).toISOString() })
			.run();
		const r = validateSession(db, token);
		expect(r!.session.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * DAY);
		const row = db.select().from(sessions).get()!;
		expect(new Date(row.expiresAt).getTime() - Date.now()).toBeGreaterThan(29 * DAY);
	});

	it('does not extend with more than 15 days left', () => {
		const { db, user } = setup();
		const { token, expiresAt } = createSession(db, user.id, null);
		const r = validateSession(db, token);
		expect(r!.session.expiresAt.getTime()).toBe(expiresAt.getTime());
	});

	it('revoke and list', () => {
		const { db, user } = setup();
		const { token } = createSession(db, user.id, 'a');
		createSession(db, user.id, 'b');
		expect(listSessions(db, user.id)).toHaveLength(2);
		const id = validateSession(db, token)!.session.id;
		revokeSession(db, id);
		expect(validateSession(db, token)).toBeNull();
		expect(db.select().from(sessions).where(eq(sessions.id, id)).all()).toHaveLength(0);
		expect(listSessions(db, user.id)).toHaveLength(1);
	});
});

describe('last_seen_at writes', () => {
	it('skips the write when fresh, writes when over 60s stale', () => {
		const { db, user } = setup();
		const { token } = createSession(db, user.id, null);
		const seen = () => db.select().from(sessions).get()!.lastSeenAt;
		const fresh = seen();
		validateSession(db, token);
		expect(seen()).toBe(fresh);
		const old = new Date(Date.now() - 61_000).toISOString();
		db.update(sessions).set({ lastSeenAt: old }).run();
		validateSession(db, token);
		expect(seen()).not.toBe(old);
	});
});
