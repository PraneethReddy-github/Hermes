import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDb } from '../db/test-utils';
import { users } from '../db/schema';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	vi.resetModules();
});

describe('getSetupToken', () => {
	it('returns a stable token logged once while no user exists, null after', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const { getSetupToken } = await import('./setup-token');
		const db = createTestDb();
		const t = getSetupToken(db);
		expect(t).toMatch(/^[A-Za-z0-9_-]{20,}$/);
		expect(getSetupToken(db)).toBe(t);
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(`[hermes] Setup token: ${t}`);
		db.insert(users).values({ username: 'me', passwordHash: 'x' }).run();
		expect(getSetupToken(db)).toBeNull();
	});

	it('writes token file with mode 600 when HERMES_E2E=1', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'hermes-st-'));
		try {
			vi.spyOn(console, 'log').mockImplementation(() => {});
			vi.stubEnv('HERMES_E2E', '1');
			vi.stubEnv('HERMES_DATA_DIR', join(dir, 'nested'));
			const { getSetupToken } = await import('./setup-token');
			const t = getSetupToken(createTestDb());
			const file = join(dir, 'nested', 'setup-token.txt');
			expect(readFileSync(file, 'utf8')).toBe(t);
			expect(statSync(file).mode & 0o777).toBe(0o600);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
