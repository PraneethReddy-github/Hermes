import { and, eq, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { Db } from './db';
import { labels, taskLabels, tasks } from './db/schema';

export type EntityType = 'task' | 'event' | 'note';

export function removeEntity(db: Db, type: EntityType, id: string): void {
	db.run(sql`DELETE FROM search_index WHERE entity_type = ${type} AND entity_id = ${id}`);
}

export function indexEntity(
	db: Db,
	type: EntityType,
	id: string,
	title: string,
	body: string
): void {
	removeEntity(db, type, id);
	db.run(
		sql`INSERT INTO search_index(entity_type, entity_id, title, body) VALUES (${type}, ${id}, ${title}, ${body})`
	);
}

/** Task FTS body = notes + label names, so searching a label finds its tasks. Deleted tasks leave the index. */
export function reindexTask(db: Db, id: string): void {
	const t = db
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
		.get();
	if (!t) return removeEntity(db, 'task', id);
	const names = db
		.select({ name: labels.name })
		.from(taskLabels)
		.innerJoin(labels, eq(labels.id, taskLabels.labelId))
		.where(eq(taskLabels.taskId, id))
		.all()
		.map((l) => l.name);
	indexEntity(db, 'task', id, t.title, [t.notes, ...names].filter(Boolean).join(' '));
}
