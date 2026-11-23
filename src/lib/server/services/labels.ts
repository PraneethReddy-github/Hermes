import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { labels, taskLabels } from '../db/schema';
import { cleanColor } from '../../swatches';
import { reindexTask } from '../search-index';

export const listLabels = (db: Db) =>
	db
		.select()
		.from(labels)
		.all()
		.sort((a, b) => a.name.localeCompare(b.name));

/** Case-insensitive find-or-create; returns ids in input order, deduped. */
export function ensureLabels(db: Db, names: string[]): string[] {
	const byName = new Map(
		db
			.select()
			.from(labels)
			.all()
			.map((l) => [l.name.toLowerCase(), l.id])
	);
	const ids = new Set<string>();
	for (const raw of names) {
		const name = raw.trim();
		if (!name) continue;
		let id = byName.get(name.toLowerCase());
		if (!id) {
			id = db.insert(labels).values({ name }).returning({ id: labels.id }).get().id;
			byName.set(name.toLowerCase(), id);
		}
		ids.add(id);
	}
	return [...ids];
}

const taskIdsWithLabel = (db: Db, labelId: string) =>
	db
		.select({ id: taskLabels.taskId })
		.from(taskLabels)
		.where(eq(taskLabels.labelId, labelId))
		.all();

const MAX_NAME = 40;

export function renameLabel(db: Db, id: string, name: string): void {
	const n = name.trim();
	if (!n) throw new Error('Add a name');
	if (n.length > MAX_NAME) throw new Error(`Name too long (max ${MAX_NAME})`);
	db.transaction(() => {
		if (
			db
				.select()
				.from(labels)
				.all()
				.some((l) => l.id !== id && l.name.toLowerCase() === n.toLowerCase())
		)
			throw new Error('Label already exists');
		db.update(labels).set({ name: n }).where(eq(labels.id, id)).run();
		for (const t of taskIdsWithLabel(db, id)) reindexTask(db, t.id);
	});
}

/** Rename and recolour in one step; '' clears the colour. */
export function updateLabel(db: Db, id: string, patch: { name: string; color: string }): void {
	db.transaction(() => {
		if (!db.select({ id: labels.id }).from(labels).where(eq(labels.id, id)).get())
			throw new Error('Label not found');
		renameLabel(db, id, patch.name);
		db.update(labels)
			.set({ color: cleanColor(patch.color) })
			.where(eq(labels.id, id))
			.run();
	});
}

export function deleteLabel(db: Db, id: string): void {
	db.transaction(() => {
		const affected = taskIdsWithLabel(db, id);
		db.delete(labels).where(eq(labels.id, id)).run(); // task_labels cascade
		for (const t of affected) reindexTask(db, t.id);
	});
}
