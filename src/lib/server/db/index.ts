import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as schema from './schema';
import { seed } from './seed';

export { newId, nowIso } from './ids';
export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export function createDb(file: string): Db {
	const sqlite = new Database(file);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
	return db;
}

let instance: Db | undefined;

export function getDb(): Db {
	if (!instance) {
		const dir = process.env.HERMES_DATA_DIR ?? './data';
		mkdirSync(dir, { recursive: true });
		instance = createDb(`${dir}/hermes.db`);
		seed(instance);
	}
	return instance;
}
