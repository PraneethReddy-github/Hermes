import {
	type AnySQLiteColumn,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import type { NoteKind, Priority, ProjectKind } from '../../types';
import { newId, nowIso } from './ids';

const base = {
	id: text('id').primaryKey().$defaultFn(newId),
	createdAt: text('created_at').notNull().$defaultFn(nowIso),
	updatedAt: text('updated_at').notNull().$defaultFn(nowIso).$onUpdateFn(nowIso)
};

export const users = sqliteTable('users', {
	...base,
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	totpSecretEnc: text('totp_secret_enc'),
	timezone: text('timezone').notNull().default('Europe/Berlin'),
	settingsJson: text('settings_json').notNull().default('{}')
});

export const sessions = sqliteTable('sessions', {
	...base,
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: text('expires_at').notNull(),
	userAgent: text('user_agent'),
	lastSeenAt: text('last_seen_at').notNull().$defaultFn(nowIso)
});

export const projects = sqliteTable('projects', {
	...base,
	name: text('name').notNull(),
	color: text('color'),
	icon: text('icon'),
	parentId: text('parent_id').references((): AnySQLiteColumn => projects.id),
	position: integer('position').notNull().default(0),
	kind: text('kind').$type<ProjectKind>().notNull().default('list'),
	archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
	isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false)
});

export const labels = sqliteTable('labels', {
	...base,
	name: text('name').notNull().unique(),
	color: text('color')
});

export const tasks = sqliteTable(
	'tasks',
	{
		...base,
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id),
		parentId: text('parent_id').references((): AnySQLiteColumn => tasks.id),
		title: text('title').notNull(),
		notes: text('notes').notNull().default(''),
		priority: integer('priority').$type<Priority>().notNull().default(0),
		dueAt: text('due_at'),
		dueHasTime: integer('due_has_time', { mode: 'boolean' }).notNull().default(false),
		startAt: text('start_at'),
		estimateMin: integer('estimate_min'),
		rrule: text('rrule'),
		completedAt: text('completed_at'),
		position: integer('position').notNull().default(0),
		deletedAt: text('deleted_at')
	},
	(t) => [index('tasks_project_idx').on(t.projectId), index('tasks_due_idx').on(t.dueAt)]
);

export const taskLabels = sqliteTable(
	'task_labels',
	{
		taskId: text('task_id')
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		labelId: text('label_id')
			.notNull()
			.references(() => labels.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.taskId, t.labelId] })]
);

export const taskCompletions = sqliteTable(
	'task_completions',
	{
		...base,
		taskId: text('task_id')
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		completedAt: text('completed_at').notNull(),
		// due/start before this completion advanced them, so undo can restore them
		prevDueAt: text('prev_due_at'),
		prevStartAt: text('prev_start_at')
	},
	(t) => [index('task_completions_task_idx').on(t.taskId)]
);

export const events = sqliteTable(
	'events',
	{
		...base,
		title: text('title').notNull(),
		notes: text('notes').notNull().default(''),
		location: text('location'),
		startAt: text('start_at').notNull(),
		endAt: text('end_at').notNull(),
		allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
		rrule: text('rrule'),
		color: text('color'),
		projectId: text('project_id').references(() => projects.id),
		icsUid: text('ics_uid'),
		deletedAt: text('deleted_at')
	},
	(t) => [index('events_start_idx').on(t.startAt), uniqueIndex('events_ics_uid_uq').on(t.icsUid)]
);

export const eventExceptions = sqliteTable(
	'event_exceptions',
	{
		...base,
		eventId: text('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		originalStart: text('original_start').notNull(),
		cancelled: integer('cancelled', { mode: 'boolean' }).notNull().default(false),
		title: text('title'),
		startAt: text('start_at'),
		endAt: text('end_at'),
		location: text('location')
	},
	(t) => [uniqueIndex('event_exceptions_event_start_uq').on(t.eventId, t.originalStart)]
);

export const notes = sqliteTable('notes', {
	...base,
	title: text('title').notNull(),
	body: text('body').notNull().default(''),
	kind: text('kind').$type<NoteKind>().notNull().default('note'),
	pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
	projectId: text('project_id').references(() => projects.id),
	deletedAt: text('deleted_at')
});

export const auditLog = sqliteTable('audit_log', {
	...base,
	at: text('at').notNull().$defaultFn(nowIso),
	actor: text('actor').notNull(),
	action: text('action').notNull(),
	entity: text('entity'),
	entityId: text('entity_id'),
	detailJson: text('detail_json')
});
