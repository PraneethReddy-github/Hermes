import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { notes, projects } from '../db/schema';
import { audit } from '../audit';
import { indexEntity, removeEntity } from '../search-index';
import { MAX_BODY, MAX_TITLE } from '../../limits';
import type { NoteKind } from '../../types';

export interface NoteInput {
	title: string;
	body?: string;
	kind?: NoteKind;
	projectId?: string | null;
	pinned?: boolean;
}

const KINDS: NoteKind[] = ['note', 'idea', 'research', 'contact'];

function check(db: Db, title: string, body: string, kind: NoteKind, projectId?: string | null) {
	if (!title && !body.trim()) throw new Error('Add a title');
	if (title.length > MAX_TITLE) throw new Error('Title is too long');
	if (body.length > MAX_BODY) throw new Error('Note is too long');
	if (!KINDS.includes(kind)) throw new Error('Invalid note kind');
	if (projectId && !db.select().from(projects).where(eq(projects.id, projectId)).get())
		throw new Error('Project not found');
}

export function createNote(db: Db, input: NoteInput) {
	const title = input.title.trim();
	const body = input.body ?? '';
	const kind = input.kind ?? 'note';
	check(db, title, body, kind, input.projectId);
	return db.transaction(() => {
		const n = db
			.insert(notes)
			.values({
				title,
				body,
				kind,
				projectId: input.projectId ?? null,
				pinned: input.pinned ?? false
			})
			.returning()
			.get();
		indexEntity(db, 'note', n.id, n.title, n.body);
		return n;
	});
}

export function deleteNote(db: Db, id: string): void {
	db.transaction(() => {
		const n = db.select().from(notes).where(eq(notes.id, id)).get();
		if (!n) throw new Error('Note not found');
		if (n.deletedAt) return;
		db.update(notes).set({ deletedAt: new Date().toISOString() }).where(eq(notes.id, id)).run();
		removeEntity(db, 'note', id);
		audit(db, 'user', 'note.delete', 'note', id);
	});
}

const live = (db: Db, id: string) =>
	db
		.select()
		.from(notes)
		.where(and(eq(notes.id, id), isNull(notes.deletedAt)))
		.get() ?? null;

export const getNote = live;

export function updateNote(db: Db, id: string, patch: Partial<NoteInput>) {
	return db.transaction(() => {
		const cur = live(db, id);
		if (!cur) throw new Error('Note not found');
		const next = {
			title: patch.title === undefined ? cur.title : patch.title.trim(),
			body: patch.body ?? cur.body,
			kind: patch.kind ?? cur.kind,
			pinned: patch.pinned ?? cur.pinned,
			projectId: patch.projectId === undefined ? cur.projectId : patch.projectId
		};
		check(db, next.title, next.body, next.kind, next.projectId);
		const n = db.update(notes).set(next).where(eq(notes.id, id)).returning().get();
		indexEntity(db, 'note', n.id, n.title, n.body);
		audit(db, 'user', 'note.update', 'note', id);
		return n;
	});
}

export function restoreNote(db: Db, id: string) {
	return db.transaction(() => {
		const n = db.select().from(notes).where(eq(notes.id, id)).get();
		if (!n) throw new Error('Note not found');
		if (!n.deletedAt) return n;
		const r = db.update(notes).set({ deletedAt: null }).where(eq(notes.id, id)).returning().get();
		indexEntity(db, 'note', r.id, r.title, r.body);
		audit(db, 'user', 'note.restore', 'note', id);
		return r;
	});
}

/** Pinned first, then most recently edited. */
export function listNotes(db: Db, opts: { kind?: NoteKind; pinnedFirst?: boolean } = {}) {
	const where = and(isNull(notes.deletedAt), opts.kind ? eq(notes.kind, opts.kind) : undefined);
	const order = [desc(notes.updatedAt), desc(notes.id)];
	return db
		.select()
		.from(notes)
		.where(where)
		.orderBy(...(opts.pinnedFirst === false ? order : [desc(notes.pinned), ...order]))
		.all();
}

export const listPinned = (db: Db) =>
	db
		.select()
		.from(notes)
		.where(and(isNull(notes.deletedAt), eq(notes.pinned, true)))
		.orderBy(desc(notes.updatedAt))
		.all();
