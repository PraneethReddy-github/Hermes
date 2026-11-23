import { redirect } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db';
import { guarded } from '../../../lib/server/task-form';
import { noteFromForm } from '../../../lib/server/note-form';
import { createNote } from '../../../lib/server/services/notes';
import type { Actions } from './$types';

export const actions: Actions = {
	save: async ({ request }) => {
		const f = await request.formData();
		const r = guarded(() => createNote(getDb(), noteFromForm(f)));
		if (!('id' in r)) return r;
		redirect(303, `/notes/${r.id}`);
	}
};
