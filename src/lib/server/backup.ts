import { mkdirSync, readdirSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import type { Db } from './db';

const NAME = /^hermes-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.db$/;

const names = (dir: string) =>
	readdirSync(dir)
		.filter((f) => NAME.test(f))
		.sort();

let inflight: Promise<string> | null = null;

/**
 * Hot-copies the DB to `${dir}/hermes-YYYYMMDD-HHmm.db` (UTC) and keeps the newest 14.
 * Writes a .tmp then renames, so a crash never damages an existing backup. A call made while
 * another runs (nightly job vs manual button) shares that run's promise.
 */
export function runBackup(db: Db, dir: string, now: Date): Promise<string> {
	return (inflight ??= doBackup(db, dir, now).finally(() => (inflight = null)));
}

async function doBackup(db: Db, dir: string, now: Date): Promise<string> {
	mkdirSync(dir, { recursive: true });
	const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
	const path = `${dir}/hermes-${stamp}.db`;
	try {
		await db.$client.backup(`${path}.tmp`);
		renameSync(`${path}.tmp`, path);
	} catch (e) {
		rmSync(`${path}.tmp`, { force: true });
		throw e;
	}
	pruneBackups(dir, 14);
	return path;
}

/** Deletes the oldest `hermes-*.db` files beyond `keep`; returns deleted names. */
export function pruneBackups(dir: string, keep: number): string[] {
	const old = names(dir).slice(0, Math.max(0, names(dir).length - keep));
	for (const f of old) unlinkSync(`${dir}/${f}`);
	return old;
}

export function lastBackup(dir: string): { file: string; at: Date } | null {
	let all: string[];
	try {
		all = names(dir);
	} catch {
		return null;
	}
	const file = all.at(-1);
	if (!file) return null;
	const [, y, mo, d, h, mi] = NAME.exec(file)!;
	return { file, at: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)) };
}

export const backupDir = () => `${process.env.HERMES_DATA_DIR ?? './data'}/backups`;

export function countBackups(dir: string): number {
	try {
		return names(dir).length;
	} catch {
		return 0;
	}
}
