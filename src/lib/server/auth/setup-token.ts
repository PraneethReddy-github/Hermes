import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db';
import { users } from '../db/schema';

let token: string | undefined;

export function getSetupToken(db: Db): string | null {
	if (db.select({ id: users.id }).from(users).limit(1).get()) return null;
	if (!token) {
		token = randomBytes(24).toString('base64url');
		console.log(`[hermes] Setup token: ${token}`);
		if (process.env.HERMES_E2E === '1') {
			const dir = process.env.HERMES_DATA_DIR ?? './data';
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, 'setup-token.txt'), token, { mode: 0o600 });
		}
	}
	return token;
}
