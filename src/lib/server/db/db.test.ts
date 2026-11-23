import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from './test-utils';
import { seed } from './seed';
import { projects, tasks } from './schema';

describe('db', () => {
	it('seed creates Inbox, Uni, Personal, Shopping once', () => {
		const db = createTestDb();
		seed(db);
		seed(db);
		const rows = db.select().from(projects).all();
		expect(rows.map((p) => p.name).sort()).toEqual(['Inbox', 'Personal', 'Shopping', 'Uni']);
		expect(rows.find((p) => p.name === 'Inbox')?.isDefault).toBe(true);
		expect(rows.find((p) => p.name === 'Shopping')?.kind).toBe('checklist');
	});

	it('fts table exists', () => {
		const db = createTestDb();
		db.run(
			sql`INSERT INTO search_index(entity_type,entity_id,title,body) VALUES('task','x','hello','')`
		);
		const rows = db.all(sql`SELECT entity_id FROM search_index WHERE search_index MATCH 'hel*'`);
		expect(rows).toHaveLength(1);
	});

	it('foreign keys enforced', () => {
		const db = createTestDb();
		expect(() =>
			db.insert(tasks).values({ id: 't1', projectId: 'nope', title: 'x' }).run()
		).toThrow();
	});
});
