import { error } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db';
import { guarded } from '../../../lib/server/task-form';
import { noteFromForm } from '../../../lib/server/note-form';
import { deleteNote, getNote, restoreNote, updateNote } from '../../../lib/server/services/notes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const n = getNote(getDb(), params.id);
	if (!n) error(404, 'Note not found');
	return { note: { id: n.id, title: n.title, body: n.body, kind: n.kind, pinned: n.pinned } };
};

export const actions: Actions = {
	save: async ({ request, params }) => {
		const f = await request.formData();
		return guarded(() => {
			updateNote(getDb(), params.id, noteFromForm(f));
			return {};
		});
	},
	delete: ({ params }) =>
		guarded(() => {
			deleteNote(getDb(), params.id);
			return {};
		}),
	restore: ({ params }) =>
		guarded(() => {
			restoreNote(getDb(), params.id);
			return {};
		})
};
