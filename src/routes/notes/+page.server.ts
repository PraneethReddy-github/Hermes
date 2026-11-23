import { getDb } from '../../lib/server/db';
import { listNotes } from '../../lib/server/services/notes';
import { noteLines, parseKind } from '../../lib/notes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const kind = parseKind(url.searchParams.get('kind'));
	return {
		kind,
		// Rows carry a short preview, never the whole body.
		notes: listNotes(getDb(), { kind: kind ?? undefined, pinnedFirst: true }).map((n) => ({
			id: n.id,
			kind: n.kind,
			pinned: n.pinned,
			...noteLines(n.title, n.body)
		}))
	};
};
