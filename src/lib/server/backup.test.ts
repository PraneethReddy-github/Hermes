import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { Db } from './db';
import { createTestDb } from './db/test-utils';
import { lastBackup, pruneBackups, runBackup } from './backup';

const tmp = () => mkdtempSync(join(tmpdir(), 'hermes-bk-'));

describe('backup', () => {
	it('pruneBackups keeps newest 14 of 20', () => {
		const dir = tmp();
		const all = Array.from(
			{ length: 20 },
			(_, i) => `hermes-202601${String(i + 1).padStart(2, '0')}-0330.db`
		);
		for (const f of all) writeFileSync(join(dir, f), '');
		writeFileSync(join(dir, 'other.db'), '');
		expect(pruneBackups(dir, 14)).toEqual(all.slice(0, 6));
		expect(readdirSync(dir).filter((f) => f.startsWith('hermes-'))).toEqual(all.slice(6));
		expect(readdirSync(dir)).toContain('other.db');
	});

	it('runBackup writes a readable sqlite file containing the projects table', async () => {
		const dir = tmp();
		const path = await runBackup(createTestDb(), dir, new Date('2026-11-23T03:30:00Z'));
		expect(path).toBe(`${dir}/hermes-20261123-0330.db`);
		const copy = new Database(path, { readonly: true });
		expect(copy.prepare('select count(*) as n from projects').get()).toHaveProperty('n');
		copy.close();
		expect(lastBackup(dir)).toEqual({
			file: 'hermes-20261123-0330.db',
			at: new Date('2026-11-23T03:30:00Z')
		});
	});

	it('a failed backup leaves no backup file and no .tmp', async () => {
		const dir = tmp();
		const failing = {
			$client: {
				backup: (p: string) => {
					writeFileSync(p, 'partial');
					return Promise.reject(new Error('disk full'));
				}
			}
		} as unknown as Db;
		await expect(runBackup(failing, dir, new Date('2026-11-23T03:30:00Z'))).rejects.toThrow(
			'disk full'
		);
		expect(readdirSync(dir)).toEqual([]);
		// a later good run is unaffected
		await runBackup(createTestDb(), dir, new Date('2026-11-23T03:30:00Z'));
		expect(readdirSync(dir)).toEqual(['hermes-20261123-0330.db']);
	});

	it('concurrent runBackup calls share one run and produce one file', async () => {
		const dir = tmp();
		const db = createTestDb();
		const now = new Date('2026-11-23T03:30:00Z');
		const [a, b] = await Promise.all([runBackup(db, dir, now), runBackup(db, dir, now)]);
		expect(a).toBe(b);
		expect(readdirSync(dir)).toEqual(['hermes-20261123-0330.db']);
	});

	it('pruneBackups and lastBackup ignore .tmp files', () => {
		const dir = tmp();
		writeFileSync(join(dir, 'hermes-20260101-0330.db'), '');
		writeFileSync(join(dir, 'hermes-20260102-0330.db.tmp'), '');
		expect(lastBackup(dir)?.file).toBe('hermes-20260101-0330.db');
		expect(pruneBackups(dir, 0)).toEqual(['hermes-20260101-0330.db']);
		expect(readdirSync(dir)).toEqual(['hermes-20260102-0330.db.tmp']);
	});
});
