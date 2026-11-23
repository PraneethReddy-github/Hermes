import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { notes } from '../db/schema';
import { createTestDb } from '../db/test-utils';
import {
	createNote,
	deleteNote,
	getNote,
	listNotes,
	listPinned,
	restoreNote,
	updateNote
} from './notes';

const indexed = (db: ReturnType<typeof createTestDb>, id: string) =>
	db.all(sql`SELECT 1 FROM search_index WHERE entity_type = 'note' AND entity_id = ${id}`).length;

describe('notes', () => {
	it('createNote stores and indexes; defaults to kind note', () => {
		const db = createTestDb();
		const n = createNote(db, { title: ' habit tracker ', kind: 'idea' });
		expect(n).toMatchObject({
			title: 'habit tracker',
			kind: 'idea',
			pinned: false,
			deletedAt: null
		});
		expect(createNote(db, { title: 'x', body: 'y' }).kind).toBe('note');
		expect(indexed(db, n.id)).toBe(1);
	});

	it('rejects empty, bad kind, unknown project', () => {
		const db = createTestDb();
		expect(() => createNote(db, { title: '  ' })).toThrow('Add a title');
		expect(createNote(db, { title: '', body: 'only body' }).body).toBe('only body');
		expect(() => createNote(db, { title: 'x', kind: 'bogus' as never })).toThrow(
			'Invalid note kind'
		);
		expect(() => createNote(db, { title: 'x', projectId: 'nope' })).toThrow('Project not found');
	});

	it('deleteNote soft-deletes and unindexes; unknown id throws', () => {
		const db = createTestDb();
		const n = createNote(db, { title: 'gone' });
		deleteNote(db, n.id);
		deleteNote(db, n.id); // idempotent
		expect(indexed(db, n.id)).toBe(0);
		expect(() => deleteNote(db, 'nope')).toThrow('Note not found');
	});

	it('rejects title over 200 and body over 100000 chars', () => {
		const db = createTestDb();
		expect(() => createNote(db, { title: 'x'.repeat(201) })).toThrow('Title is too long');
		expect(createNote(db, { title: ` ${'x'.repeat(200)} ` }).title).toHaveLength(200);
		expect(() => createNote(db, { title: 'x', body: 'y'.repeat(100_001) })).toThrow(
			'Note is too long'
		);
		const n = createNote(db, { title: 'x' });
		expect(() => updateNote(db, n.id, { title: 'x'.repeat(201) })).toThrow('Title is too long');
		expect(() => updateNote(db, n.id, { body: 'y'.repeat(100_001) })).toThrow('Note is too long');
	});

	it('listNotes pinned first, then newest; filters by kind; skips deleted', () => {
		const db = createTestDb();
		const a = createNote(db, { title: 'a', kind: 'idea' });
		const b = createNote(db, { title: 'b', pinned: true });
		const c = createNote(db, { title: 'c' });
		const gone = createNote(db, { title: 'gone' });
		deleteNote(db, gone.id);
		// pin explicit timestamps: same-millisecond writes would tie
		for (const [n, t] of [
			[a, 3],
			[c, 2],
			[b, 1]
		] as const)
			db.update(notes)
				.set({ updatedAt: `2026-01-01T00:00:0${t}.000Z` })
				.where(eq(notes.id, n.id))
				.run();
		const ids = (kind?: 'idea') => listNotes(db, { kind, pinnedFirst: true }).map((n) => n.id);
		expect(ids()).toEqual([b.id, a.id, c.id]);
		expect(ids('idea')).toEqual([a.id]);
		expect(listPinned(db).map((n) => n.id)).toEqual([b.id]);
	});

	it('updateNote patches, reindexes, throws on unknown/deleted', () => {
		const db = createTestDb();
		const n = createNote(db, { title: 'old', body: 'zebra' });
		const u = updateNote(db, n.id, { title: 'new', kind: 'idea', pinned: true });
		expect(u).toMatchObject({ title: 'new', body: 'zebra', kind: 'idea', pinned: true });
		expect(() => updateNote(db, n.id, { title: '', body: ' ' })).toThrow('Add a title');
		expect(() => updateNote(db, n.id, { kind: 'bogus' as never })).toThrow('Invalid note kind');
		expect(() => updateNote(db, 'nope', { title: 'x' })).toThrow('Note not found');
		deleteNote(db, n.id);
		expect(() => updateNote(db, n.id, { title: 'x' })).toThrow('Note not found');
		expect(getNote(db, n.id)).toBeNull();
	});

	it('restoreNote undeletes and reindexes', () => {
		const db = createTestDb();
		const n = createNote(db, { title: 'back' });
		deleteNote(db, n.id);
		expect(restoreNote(db, n.id).deletedAt).toBeNull();
		expect(indexed(db, n.id)).toBe(1);
		expect(getNote(db, n.id)?.title).toBe('back');
		expect(() => restoreNote(db, 'nope')).toThrow('Note not found');
	});
});
