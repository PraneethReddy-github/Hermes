// Actions only: the capture sheet posts here. GET has no page.
import { fail } from '@sveltejs/kit';
import { actionOnlyLoad } from '../../lib/server/auth/guard';
import { getDb } from '../../lib/server/db';
import { field } from '../../lib/server/form';
import { guarded } from '../../lib/server/task-form';
import { createEvent, deleteEvent } from '../../lib/server/services/events';
import { createNote, deleteNote } from '../../lib/server/services/notes';
import { getInboxId, listProjects } from '../../lib/server/services/projects';
import { createTask, deleteTask } from '../../lib/server/services/tasks';
import { asType } from '../../lib/capture/classify';
import { localDayKey } from '../../lib/time';
import type { CaptureType } from '../../lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = actionOnlyLoad;

const TYPES: string[] = ['task', 'event', 'note', 'shopping'] satisfies CaptureType[];
const UNDO = ['task', 'event', 'note'];

export const actions: Actions = {
	// The client's pill choice is a hint only: the text is classified again here.
	save: async ({ request, locals }) => {
		const f = await request.formData();
		const [text, type] = [field(f, 'text'), field(f, 'type')];
		if (!TYPES.includes(type)) return fail(400, { error: 'Invalid type' });
		const timeZone = locals.user!.timezone;
		const now = new Date();
		return guarded(() => {
			const db = getDb();
			const projects = listProjects(db);
			const r = asType(text, type as CaptureType, {
				now,
				timeZone,
				projectNames: projects.map((p) => p.name)
			});
			const saved = (kind: 'task' | 'event' | 'note', id: string, place: string) => ({
				saved: { place, undo: `/capture?/undo&kind=${kind}&id=${id}` }
			});
			if (r.type === 'event') {
				const e = createEvent(db, { title: r.title, ...r.event! }, timeZone);
				return saved('event', e.id, 'Calendar');
			}
			if (r.type === 'note') {
				const n = createNote(db, { title: r.title, kind: r.noteKind });
				return saved('note', n.id, 'Notes');
			}
			if (r.type === 'shopping') {
				const shop = projects.find((p) => p.name.toLowerCase() === 'shopping');
				const t = createTask(
					db,
					{ title: r.title, projectId: shop?.id ?? getInboxId(db) },
					{ now, timeZone }
				);
				return saved('task', t.id, shop ? 'Shopping' : 'Inbox (no Shopping list)');
			}
			const q = r.quick!;
			const project = projects.find((p) => p.name.toLowerCase() === q.projectName?.toLowerCase());
			const t = createTask(
				db,
				{
					title: q.title,
					priority: q.priority,
					labelNames: q.labels,
					projectId: project?.id,
					dueAt: q.dueAt,
					dueHasTime: q.dueHasTime,
					rrule: q.rrule,
					estimateMin: q.estimateMin
				},
				{ now, timeZone }
			);
			const place = t.dueAt
				? localDayKey(t.dueAt, timeZone) <= localDayKey(now.toISOString(), timeZone)
					? 'Today'
					: 'Upcoming'
				: (project?.name ?? 'Inbox');
			return saved('task', t.id, place);
		});
	},
	// Toast Undo: `/capture?/undo&kind=task&id=<id>`.
	undo: ({ url, locals }) => {
		const [kind, id] = [url.searchParams.get('kind') ?? '', url.searchParams.get('id') ?? ''];
		if (!UNDO.includes(kind) || !id) return fail(400, { error: 'Nothing to undo' });
		return guarded(() => {
			const db = getDb();
			if (kind === 'task') deleteTask(db, id);
			else if (kind === 'note') deleteNote(db, id);
			else deleteEvent(db, id, 'all', undefined, locals.user!.timezone);
			return {};
		});
	}
};
