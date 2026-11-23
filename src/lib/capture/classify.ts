import { addLocalDays, localDayKey, localTime, localToIso } from '../time';
import { parseQuickAdd, type ParsedQuickAdd } from '../quickadd/parse';
import type { CaptureType, NoteKind } from '../types';
import { GROCERIES } from './groceries';

export interface CaptureResult {
	type: CaptureType;
	title: string;
	noteKind?: NoteKind;
	event?: { startAt: string; endAt: string; allDay: boolean };
	quick?: ParsedQuickAdd;
}
export interface CaptureOpts {
	now: Date;
	timeZone: string;
	projectNames: string[];
}

const HOUR = 3600000;
const pad = (n: number) => String(n).padStart(2, '0');

// "14-15", "14:00–15:30", "2pm-3pm", "von 14 bis 15 Uhr". Bare numbers need a plain dash;
// word separators (to/bis) need a marker (von/from, :mm, am/pm, Uhr) so "2 to 3 apples" stays text.
const RANGE =
	/(?<![\p{L}\p{N}.:/-])(von\s+|from\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm|uhr)?\s*([-–—]|bis|to|until)\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm|uhr)?(?=\s|$)/iu;

const to24 = (h: number, ap?: string) => (ap === 'pm' ? (h % 12) + 12 : ap === 'am' ? h % 12 : h);

/** Time range in `text`: start/end as HH:MM and the text with the range blanked (same length, so chip offsets hold). */
function findRange(
	text: string
): { start: string; end: string; rest: string; at: [number, number] } | null {
	const m = RANGE.exec(text);
	if (!m) return null;
	const [h1, h2] = [Number(m[2]), Number(m[6])];
	const [m1, m2] = [Number(m[3] ?? 0), Number(m[7] ?? 0)];
	const ap1 = m[4]?.toLowerCase() === 'uhr' ? undefined : m[4]?.toLowerCase();
	const ap2 = m[8]?.toLowerCase() === 'uhr' ? undefined : m[8]?.toLowerCase();
	const marked = m[1] || m[3] || m[4] || m[7] || m[8];
	if (!marked && !/^[-–—]$/.test(m[5])) return null;
	if ((ap1 || ap2) && (h1 < 1 || h1 > 12 || h2 < 1 || h2 > 12)) return null;
	if (h1 > 23 || h2 > 24 || (h2 === 24 && m2 > 0)) return null;
	let s = to24(h1, ap1 ?? ap2);
	const e = to24(h2, ap2) % 24;
	if (!ap1 && ap2 && s * 60 + m1 > e * 60 + m2) s = to24(h1, 'am'); // 11-1pm
	const [i, len] = [m.index, m[0].length];
	return {
		start: `${pad(s)}:${pad(m1)}`,
		end: `${pad(e)}:${pad(m2)}`,
		rest: text.slice(0, i) + ' '.repeat(len) + text.slice(i + len),
		at: [i, i + len]
	};
}

const today = (o: CaptureOpts) => localDayKey(o.now.toISOString(), o.timeZone);

function eventFromRange(text: string, o: CaptureOpts): CaptureResult | null {
	const r = findRange(text);
	if (!r) return null;
	const p = parseQuickAdd(r.rest, o);
	const day = p.dueAt ? localDayKey(p.dueAt, o.timeZone) : today(o);
	const endDay = r.end <= r.start ? addLocalDays(day, 1) : day;
	return {
		type: 'event',
		title: p.title,
		event: {
			startAt: localToIso(day, r.start, o.timeZone),
			endAt: localToIso(endDay, r.end, o.timeZone),
			allDay: false
		}
	};
}

/** Forced event without a range: one hour at the parsed time, else at the next full hour. */
function eventAnyTime(text: string, o: CaptureOpts): CaptureResult {
	const p = parseQuickAdd(text, o);
	let start: string;
	if (p.dueAt && p.dueHasTime) start = p.dueAt;
	else {
		const nextHour = (Number(localTime(o.now.toISOString(), o.timeZone).slice(0, 2)) + 1) % 24;
		const day = p.dueAt ? localDayKey(p.dueAt, o.timeZone) : today(o);
		start = localToIso(day, `${pad(nextHour)}:00`, o.timeZone);
		// next full hour from now may be tomorrow 00:00
		if (day === today(o) && start <= o.now.toISOString())
			start = localToIso(addLocalDays(day, 1), '00:00', o.timeZone);
	}
	const end = new Date(Date.parse(start) + HOUR).toISOString();
	return { type: 'event', title: p.title, event: { startAt: start, endAt: end, allDay: false } };
}

function taskFrom(text: string, o: CaptureOpts): CaptureResult {
	const r = findRange(text);
	const quick = parseQuickAdd(r?.rest ?? text, o);
	if (r) {
		// the range gives the time of day; a date token (or today) gives the day
		const day = quick.dueAt ? localDayKey(quick.dueAt, o.timeZone) : today(o);
		quick.dueAt = localToIso(day, r.start, o.timeZone);
		quick.dueHasTime = true;
		quick.chips.push({ kind: 'due', text: text.slice(...r.at), start: r.at[0], end: r.at[1] });
		quick.chips.sort((a, b) => a.start - b.start);
	}
	return { type: 'task', title: quick.title, quick };
}

const BUY = /^(?:buy|get|kaufen)\s+/i;
const NOTES: [RegExp, NoteKind, boolean][] = [
	[/^(?:idea|idee):\s*/i, 'idea', true],
	[/^research:\s*/i, 'research', true],
	[/^look up\s+/i, 'research', false],
	[/^(?:call|contact|text|anrufen)\s+/i, 'contact', false]
];

function shopping(text: string): CaptureResult | null {
	const t = text.trim();
	const words = t.toLowerCase().match(/\p{L}+/gu) ?? [];
	if (!BUY.test(t) && !(words.length <= 3 && words.some((w) => GROCERIES.has(w)))) return null;
	return { type: 'shopping', title: t.replace(BUY, '') };
}

function note(text: string): CaptureResult | null {
	const t = text.trim();
	for (const [re, noteKind, strip] of NOTES)
		if (re.test(t)) return { type: 'note', title: strip ? t.replace(re, '') : t, noteKind };
	return null;
}

export function classifyCapture(text: string, opts: CaptureOpts): CaptureResult {
	// explicit note prefixes (idea:, call …) beat the fuzzy grocery word list
	return eventFromRange(text, opts) ?? note(text) ?? shopping(text) ?? taskFrom(text, opts);
}

/** The user's pill choice wins; reuse the classifier's cleanup when it already agrees. */
export function asType(text: string, type: CaptureType, opts: CaptureOpts): CaptureResult {
	const auto = classifyCapture(text, opts);
	if (auto.type === type) return auto;
	switch (type) {
		case 'task':
			return taskFrom(text, opts);
		case 'event':
			return eventAnyTime(text, opts);
		case 'note':
			return { type, title: text.trim(), noteKind: 'note' };
		case 'shopping':
			return { type, title: text.trim().replace(BUY, '') };
	}
}
