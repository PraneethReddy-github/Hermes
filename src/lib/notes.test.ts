import { describe, expect, it } from 'vitest';
import { noteLines, parseKind } from './notes';

describe('notes helpers', () => {
	it('parseKind falls back to null', () => {
		expect(parseKind('idea')).toBe('idea');
		expect(parseKind('bogus')).toBeNull();
		expect(parseKind('toString')).toBeNull();
		expect(parseKind(null)).toBeNull();
	});

	it('noteLines strips markdown and falls back to the first body line', () => {
		expect(noteLines('T', '\n# **Head** [x](http://a)\nmore')).toEqual({
			name: 'T',
			preview: 'Head x'
		});
		expect(noteLines('', '- [ ] first\n> second')).toEqual({ name: 'first', preview: 'second' });
		expect(noteLines('', '')).toEqual({ name: '', preview: '' });
	});
});
