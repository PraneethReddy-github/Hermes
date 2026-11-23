import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { events, notes, projects, tasks } from '../db/schema';
import { cleanColor } from '../../swatches';
import type { ProjectKind } from '../../types';

export interface ProjectInput {
	name: string;
	color?: string | null;
	icon?: string | null;
	parentId?: string | null;
	kind?: ProjectKind;
}

export function getInboxId(db: Db): string {
	const row = db
		.select({ id: projects.id })
		.from(projects)
		.where(eq(projects.isDefault, true))
		.get();
	if (!row) throw new Error('Inbox missing');
	return row.id;
}

export function listProjects(db: Db, opts: { includeArchived?: boolean } = {}) {
	const rows = db.select().from(projects).orderBy(asc(projects.position)).all();
	return opts.includeArchived ? rows : rows.filter((p) => !p.archived);
}

const MAX_NAME = 60;

function cleanName(db: Db, name: string, selfId: string | null) {
	const n = name.trim();
	if (!n) throw new Error('Add a name');
	if (n.length > MAX_NAME) throw new Error(`Name too long (max ${MAX_NAME})`);
	const taken = db
		.select({ id: projects.id, name: projects.name })
		.from(projects)
		.all()
		.some((p) => p.id !== selfId && p.name.toLowerCase() === n.toLowerCase());
	if (taken) throw new Error('A project with that name exists');
	return n;
}

/** One level of nesting only; a project with children cannot itself get a parent. */
function checkParent(db: Db, id: string | null, parentId: string): void {
	const parent = db.select().from(projects).where(eq(projects.id, parentId)).get();
	if (!parent) throw new Error('Project not found');
	if (parentId === id || parent.parentId) throw new Error('Projects can only nest one level');
	if (id && db.select({ id: projects.id }).from(projects).where(eq(projects.parentId, id)).get())
		throw new Error('Projects can only nest one level');
}

// whitelist: callers must never set isDefault/archived/position through these
const pick = (i: Partial<ProjectInput>) => ({
	...(i.color !== undefined && { color: cleanColor(i.color) }),
	...(i.icon !== undefined && { icon: i.icon }),
	...(i.parentId !== undefined && { parentId: i.parentId }),
	...(i.kind !== undefined && { kind: cleanKind(i.kind) })
});

function cleanKind(kind: string): ProjectKind {
	if (kind !== 'list' && kind !== 'checklist') throw new Error('Invalid project kind');
	return kind;
}

export function createProject(db: Db, input: ProjectInput) {
	return db.transaction(() => {
		const name = cleanName(db, input.name, null);
		if (input.parentId) checkParent(db, null, input.parentId);
		const max = db
			.select({ m: sql<number>`coalesce(max(${projects.position}), -1)` })
			.from(projects)
			.get()!.m;
		return db
			.insert(projects)
			.values({ ...pick(input), name, position: max + 1 })
			.returning()
			.get();
	});
}

export function updateProject(db: Db, id: string, patch: Partial<ProjectInput>) {
	return db.transaction(() => {
		const name = patch.name === undefined ? undefined : cleanName(db, patch.name, id);
		if (patch.parentId) checkParent(db, id, patch.parentId);
		const set = { ...pick(patch), ...(name !== undefined && { name }) };
		if (!Object.keys(set).length) {
			const cur = db.select().from(projects).where(eq(projects.id, id)).get();
			if (!cur) throw new Error('Project not found');
			return cur;
		}
		const row = db.update(projects).set(set).where(eq(projects.id, id)).returning().get();
		if (!row) throw new Error('Project not found');
		return row;
	});
}

function nonInbox(db: Db, id: string) {
	const p = db.select().from(projects).where(eq(projects.id, id)).get();
	if (!p) throw new Error('Project not found');
	if (p.isDefault) throw new Error('Inbox cannot be removed');
}

export function archiveProject(db: Db, id: string): void {
	nonInbox(db, id);
	db.update(projects).set({ archived: true }).where(eq(projects.id, id)).run();
}

export function unarchiveProject(db: Db, id: string): void {
	nonInbox(db, id);
	db.update(projects).set({ archived: false }).where(eq(projects.id, id)).run();
}

/** Tasks move to Inbox; events/notes lose their project; child projects become top-level. */
export function deleteProject(db: Db, id: string): void {
	nonInbox(db, id);
	db.transaction(() => {
		db.update(tasks)
			.set({ projectId: getInboxId(db) })
			.where(eq(tasks.projectId, id))
			.run();
		db.update(events).set({ projectId: null }).where(eq(events.projectId, id)).run();
		db.update(notes).set({ projectId: null }).where(eq(notes.projectId, id)).run();
		db.update(projects).set({ parentId: null }).where(eq(projects.parentId, id)).run();
		db.delete(projects).where(eq(projects.id, id)).run();
	});
}

export function reorderProjects(db: Db, ids: string[]): void {
	db.transaction(() => {
		ids.forEach((id, position) =>
			db.update(projects).set({ position }).where(eq(projects.id, id)).run()
		);
	});
}
