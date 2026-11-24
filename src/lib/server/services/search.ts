import { sql } from 'drizzle-orm';
import type { Db } from '../db';
import { formatDue, localDayKey, localTime } from '../../time';
import { getUserSettings } from './settings';

export interface Hit {
	id: string;
	title: string;
	/** Body excerpt; matches wrapped in U+0002 / U+0003 (split on them, never render as HTML). */
	snippet: string;
	extra?: string;
	/** Events: part of a repeating series. */
	recurring?: boolean;
	done?: boolean;
	/** Events: local day (YYYY-MM-DD) to open in the agenda. */
	date?: string;
}
export interface SearchCtx {
	now?: Date;
	timeZone?: string;
}

const MAX_CHARS = 200;
const MAX_TERMS = 8;

/** Every word becomes a quoted prefix term, so user input can never be FTS5 syntax. */
export function toFtsQuery(input: string): string | null {
	const terms = input
		.slice(0, MAX_CHARS)
		.split(/[^\p{L}\p{N}\p{M}]+/u) // same boundaries as the unicode61 tokenizer
		.filter(Boolean)
		.slice(0, MAX_TERMS)
		.map((w) => `"${w}"*`);
	return terms.length ? terms.join(' ') : null;
}

interface Row {
	id: string;
	title: string;
	snip: string | null;
	[k: string]: unknown;
}

// Source-table join drops soft-deleted rows the index may still hold.
function run(
	db: Db,
	type: string,
	q: string,
	limit: number,
	cols: string,
	from: string,
	order: string
) {
	return db.all<Row>(sql`
		SELECT s.entity_id AS id, s.title AS title,
			snippet(search_index, 3, char(2), char(3), '…', 10) AS snip ${sql.raw(cols)}
		FROM search_index s ${sql.raw(from)}
		WHERE search_index MATCH ${q} AND s.entity_type = ${type} AND x.deleted_at IS NULL
		ORDER BY ${sql.raw(order)} bm25(search_index) LIMIT ${limit}`);
}

const snippetOf = (r: Row) => (r.snip ?? '').replace(/\s+/g, ' ').trim();

const DAY_FMT = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'UTC',
	weekday: 'short',
	day: 'numeric',
	month: 'short'
});

export function searchAll(
	db: Db,
	input: string,
	limit = 50,
	ctx: SearchCtx = {}
): { tasks: Hit[]; events: Hit[]; notes: Hit[] } {
	const q = toFtsQuery(input);
	if (!q) return { tasks: [], events: [], notes: [] };
	const tz = ctx.timeZone ?? getUserSettings(db).timezone;
	const now = ctx.now ?? new Date();

	const tasks = run(
		db,
		'task',
		q,
		limit,
		', x.due_at AS due_at, x.due_has_time AS due_has_time, x.completed_at AS completed_at, p.name AS project',
		'JOIN tasks x ON x.id = s.entity_id LEFT JOIN projects p ON p.id = x.project_id',
		'(x.completed_at IS NOT NULL),'
	).map((r): Hit => {
		const due = r.due_at ? formatDue(r.due_at as string, !!r.due_has_time, tz, now) : '';
		return {
			id: r.id,
			title: r.title,
			snippet: snippetOf(r),
			extra: [due, r.project].filter(Boolean).join(' · ') || undefined,
			done: r.completed_at != null
		};
	});

	const events = run(
		db,
		'event',
		q,
		limit,
		', x.start_at AS start_at, x.all_day AS all_day, x.rrule AS rrule',
		'JOIN events x ON x.id = s.entity_id',
		''
	).map((r): Hit => {
		const start = r.start_at as string;
		const date = localDayKey(start, tz);
		const [y, m, d] = date.split('-').map(Number);
		const label = DAY_FMT.format(new Date(Date.UTC(y, m - 1, d))).replace(',', '');
		const extra = [label, !r.all_day && localTime(start, tz)].filter(Boolean).join(' ');
		return { id: r.id, title: r.title, snippet: snippetOf(r), extra, date, recurring: !!r.rrule };
	});

	const notes = run(db, 'note', q, limit, '', 'JOIN notes x ON x.id = s.entity_id', '').map(
		(r): Hit => ({ id: r.id, title: r.title, snippet: snippetOf(r) })
	);

	return { tasks, events, notes };
}
