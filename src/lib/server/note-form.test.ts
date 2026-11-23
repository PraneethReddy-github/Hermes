import { expect, it } from 'vitest';
import { noteFromForm } from './note-form';

it('noteFromForm normalises CRLF and rejects unknown kinds', () => {
	const f = new FormData();
	f.set('body', 'a\r\nb\rc');
	expect(noteFromForm(f).body).toBe('a\nb\nc');
	f.set('kind', 'bogus');
	expect(() => noteFromForm(f)).toThrow('Invalid note kind');
});
