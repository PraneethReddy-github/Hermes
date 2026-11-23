import { describe, expect, it } from 'vitest';
import { createTestDb } from '../db/test-utils';
import { createTask, getTask } from './tasks';
import {
	archiveProject,
	createProject,
	deleteProject,
	getInboxId,
	listProjects,
	reorderProjects,
	unarchiveProject,
	updateProject
} from './projects';
import { getUserSettings, updateUserSettings } from './settings';
import { users } from '../db/schema';

describe('projects', () => {
	it('deleteProject moves tasks to Inbox', () => {
		const db = createTestDb();
		const p = createProject(db, { name: 'Temp' });
		const t = createTask(db, { title: 'x', projectId: p.id });
		deleteProject(db, p.id);
		expect(getTask(db, t.id)?.projectId).toBe(getInboxId(db));
		expect(listProjects(db, { includeArchived: true }).some((x) => x.id === p.id)).toBe(false);
	});

	it('deleting or archiving Inbox throws', () => {
		const db = createTestDb();
		expect(() => deleteProject(db, getInboxId(db))).toThrow('Inbox cannot be removed');
		expect(() => archiveProject(db, getInboxId(db))).toThrow('Inbox cannot be removed');
	});

	it('archive hides from default list; reorder sets positions', () => {
		const db = createTestDb();
		const [a, b] = listProjects(db);
		archiveProject(db, b.id);
		expect(listProjects(db).some((x) => x.id === b.id)).toBe(false);
		expect(listProjects(db, { includeArchived: true }).some((x) => x.id === b.id)).toBe(true);
		reorderProjects(db, [b.id, a.id]);
		expect(listProjects(db, { includeArchived: true })[0].id).toBe(b.id);
	});
});

describe('project field whitelist and nesting', () => {
	it('ignores isDefault/archived/position and enforces one-level nesting', () => {
		const db = createTestDb();
		const evil = { name: 'X', isDefault: true, archived: true, position: 99 } as never;
		const p = createProject(db, evil);
		expect(p.isDefault).toBe(false);
		expect(p.archived).toBe(false);
		expect(p.position).not.toBe(99);
		const u = updateProject(db, p.id, { name: 'Y', isDefault: true, archived: true } as never);
		expect(u).toMatchObject({ name: 'Y', isDefault: false, archived: false });
		const child = createProject(db, { name: 'child', parentId: p.id });
		expect(() => createProject(db, { name: 'g', parentId: child.id })).toThrow('one level');
		expect(() => updateProject(db, p.id, { parentId: p.id })).toThrow('one level');
		expect(() => updateProject(db, p.id, { parentId: getInboxId(db) })).toThrow('one level');
		expect(() => updateProject(db, child.id, { parentId: child.id })).toThrow('one level');
	});
});

describe('project validation', () => {
	it('names are trimmed, 1-60 chars and unique case-insensitively', () => {
		const db = createTestDb();
		expect(createProject(db, { name: '  Trip  ' }).name).toBe('Trip');
		expect(() => createProject(db, { name: 'tRIP' })).toThrow('A project with that name exists');
		expect(() => createProject(db, { name: '   ' })).toThrow('Add a name');
		expect(() => createProject(db, { name: 'x'.repeat(61) })).toThrow('too long');
		expect(createProject(db, { name: 'x'.repeat(60) }).name).toHaveLength(60);
		const p = createProject(db, { name: 'Other' });
		expect(() => updateProject(db, p.id, { name: 'trip' })).toThrow('exists');
		expect(updateProject(db, p.id, { name: 'OTHER' }).name).toBe('OTHER'); // own name is fine
	});

	it('colour must be a swatch, kind a known kind; unarchive reverses archive', () => {
		const db = createTestDb();
		expect(() => createProject(db, { name: 'A', color: '#123456' })).toThrow('Invalid colour');
		expect(() => createProject(db, { name: 'A', kind: 'x' as never })).toThrow('Invalid project');
		const p = createProject(db, { name: 'B', color: '#5B9BD5', kind: 'checklist' });
		expect(p).toMatchObject({ color: '#5B9BD5', kind: 'checklist' });
		expect(updateProject(db, p.id, { color: '' }).color).toBeNull();
		archiveProject(db, p.id);
		unarchiveProject(db, p.id);
		expect(listProjects(db).some((x) => x.id === p.id)).toBe(true);
	});
});

describe('settings', () => {
	it('fills defaults for missing/partial settings_json and persists patches', () => {
		const db = createTestDb();
		expect(getUserSettings(db)).toEqual({
			timezone: 'Europe/Berlin',
			theme: 'system',
			weekStart: 1
		});
		db.insert(users)
			.values({ username: 'a', passwordHash: 'x', settingsJson: '{"theme":"dark"}' })
			.run();
		expect(getUserSettings(db)).toEqual({ timezone: 'Europe/Berlin', theme: 'dark', weekStart: 1 });
		updateUserSettings(db, { timezone: 'Asia/Tokyo', weekStart: 0 });
		expect(getUserSettings(db)).toEqual({ timezone: 'Asia/Tokyo', theme: 'dark', weekStart: 0 });
		expect(() => updateUserSettings(db, { timezone: 'Nope/Zone' })).toThrow('Invalid timezone');
	});
});
