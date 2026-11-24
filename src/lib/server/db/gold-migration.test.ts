import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createTestDb } from './test-utils';
import { events, labels, projects } from './schema';

describe('0005_gold_colour migration', () => {
	it('rewrites #E3A93B (any case) to #D4AF37 and leaves other colours alone', () => {
		const db = createTestDb();
		db.insert(projects)
			.values([
				{ id: 'p1', name: 'A', color: '#E3A93B' },
				{ id: 'p2', name: 'B', color: '#e3a93b' },
				{ id: 'p3', name: 'C', color: '#5B9BD5' },
				{ id: 'p4', name: 'D', color: null }
			])
			.run();
		db.insert(labels)
			.values([
				{ id: 'l1', name: 'x', color: '#E3A93B' },
				{ id: 'l2', name: 'y', color: '#58B37A' }
			])
			.run();
		const at = '2026-01-01T00:00:00.000Z';
		db.insert(events)
			.values([
				{ id: 'e1', title: 'a', startAt: at, endAt: at, color: '#e3A93b' },
				{ id: 'e2', title: 'b', startAt: at, endAt: at, color: '#E05252' }
			])
			.run();

		const file = readFileSync('drizzle/0005_gold_colour.sql', 'utf8');
		for (const stmt of file.split('--> statement-breakpoint')) db.$client.exec(stmt);

		const colors = (rows: { id: string; color: string | null }[]) =>
			Object.fromEntries(rows.map((r) => [r.id, r.color]));
		expect(colors(db.select().from(projects).all())).toMatchObject({
			p1: '#D4AF37',
			p2: '#D4AF37',
			p3: '#5B9BD5',
			p4: null
		});
		expect(colors(db.select().from(labels).all())).toMatchObject({
			l1: '#D4AF37',
			l2: '#58B37A'
		});
		expect(colors(db.select().from(events).all())).toMatchObject({
			e1: '#D4AF37',
			e2: '#E05252'
		});
	});
});
