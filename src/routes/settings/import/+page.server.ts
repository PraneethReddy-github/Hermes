import { fail } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db';
import { MAX_ICS_BYTES, importIcs } from '../../../lib/server/ics';
import { getUserSettings } from '../../../lib/server/services/settings';
import { guarded } from '../../../lib/server/task-form';
import type { Actions } from './$types';

const TOO_BIG = 'File too large (max 2 MB)';

export const actions: Actions = {
	default: async ({ request }) => {
		// multipart framing adds a little to the file itself
		if (Number(request.headers.get('content-length')) > MAX_ICS_BYTES + 64 * 1024)
			return fail(400, { error: TOO_BIG });
		const file = (await request.formData()).get('file');
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { error: 'Choose a .ics file' });
		if (file.size > MAX_ICS_BYTES) return fail(400, { error: TOO_BIG });
		const text = await file.text();
		const db = getDb();
		const result = guarded(() => importIcs(db, text, getUserSettings(db).timezone));
		return 'created' in result ? { result } : result;
	}
};
