import { field } from './form';
import { parseKind } from '../notes';
import type { NoteInput } from './services/notes';

/** Editor form → note fields. An unknown kind is a bad request, not a silent default. */
export function noteFromForm(f: FormData): NoteInput {
	const kind = field(f, 'kind') || 'note';
	if (!parseKind(kind)) throw new Error('Invalid note kind');
	return {
		title: field(f, 'title'),
		// Browsers submit textarea newlines as CRLF; store (and count) LF.
		body: field(f, 'body').replace(/\r\n?/g, '\n'),
		kind: kind as NoteInput['kind'],
		pinned: field(f, 'pinned') === 'on'
	};
}
