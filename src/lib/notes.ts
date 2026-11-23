import type { NoteKind } from './types';

export const KIND_LABELS: Record<NoteKind, string> = {
	note: 'Note',
	idea: 'Idea',
	research: 'Research',
	contact: 'Contact'
};
export const KIND_PLURALS: Record<NoteKind, string> = {
	note: 'Notes',
	idea: 'Ideas',
	research: 'Research',
	contact: 'Contacts'
};

export const parseKind = (v: string | null): NoteKind | null =>
	v && Object.hasOwn(KIND_LABELS, v) ? (v as NoteKind) : null;

/** Crude markdown strip for list rows; the result is only ever rendered as text. */
const plain = (line: string) =>
	line
		.replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[*_`~]/g, '')
		.trim();

/** Row text: the title (or the first body line when untitled) and the next body line. */
export function noteLines(title: string, body: string): { name: string; preview: string } {
	const lines = body
		.split('\n')
		.map(plain)
		.filter(Boolean)
		.slice(0, 2)
		.map((l) => l.slice(0, 140));
	return title
		? { name: title, preview: lines[0] ?? '' }
		: { name: lines[0] ?? '', preview: lines[1] ?? '' };
}
