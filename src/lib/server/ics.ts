import ICAL from 'ical.js'; // only a default export resolves in plain Node ESM
import { TZDate } from '@date-fns/tz';
import { isNotNull, eq } from 'drizzle-orm';
import { expandOccurrences } from '../recurrence';
import type { Db } from './db';
import { eventExceptions, events } from './db/schema';
import { createEvent } from './services/events';
import { validateRrule } from './services/tasks';
import { endOfLocalDay, localTime, localToIso, startOfLocalDay } from '../time';
import type { EventInput } from '../types';

export const MAX_ICS_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 2000;
const MAX_TITLE = 200;
const HOUR = 3600000;
const DAY = 86400000;
const YEAR = 365.25 * DAY;
// recurrence expansion runs from DTSTART, so old or impossible rules are imported once instead of costing seconds per query
const MAX_SERIES_AGE = 30 * YEAR;
const IMPOSSIBLE_WINDOW = 5 * YEAR;
// 5 years of daily steps is ~1.8k iterations (~2 reads each); a never-matching rule is rejected in ~50 ms
const PROBE_MAX_READS = 30_000;
const MAX_EXDATES = 500;
// Recurrence checks cost real CPU, so a hostile file cannot make them add up: past this, recurring events import once.
const CPU_BUDGET_MS = 4000;
const EXDATE_SPAN = MAX_SERIES_AGE + IMPOSSIBLE_WINDOW;
const UNREADABLE = 'Could not read this calendar file';
const pad = (n: number) => String(n).padStart(2, '0');

export type ParsedEvent = EventInput & {
	uid?: string;
	exdates: string[];
	ignoredExdates: number;
	simplified: boolean;
};
/** A VEVENT that cannot be imported: a RECURRENCE-ID override (unsupported in v1) or unreadable data. */
export type Parsed = ParsedEvent | { skip: 'override' | 'invalid' };

const dayKey = (t: ICAL.Time) => `${String(t.year).padStart(4, '0')}-${pad(t.month)}-${pad(t.day)}`;

/** ISO string for a ms instant; throws on dates outside a sane range so bad data cannot reach the DB layer. */
function toIso(ms: number): string {
	const d = new Date(ms);
	const y = d.getUTCFullYear();
	if (Number.isNaN(y) || y < 1900 || y > 2200) throw new Error('Date out of range');
	return d.toISOString();
}

/** UTC instant of an ICS date-time. Z and TZIDs with a VTIMEZONE in the file are exact; others are wall-clock in the IANA zone, else in `tz`. */
function instant(t: ICAL.Time, tzid: string | null | undefined, tz: string): number {
	if (t.zone === ICAL.Timezone.utcTimezone)
		return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
	if (t.zone !== ICAL.Timezone.localTimezone) return t.toUnixTime() * 1000;
	const wall = (zone: string) =>
		new TZDate(t.year, t.month - 1, t.day, t.hour, t.minute, t.second, zone).getTime();
	const ms = tzid ? wall(tzid) : NaN; // unknown zone name -> NaN
	return Number.isNaN(ms) ? wall(tz) : ms;
}

function rruleOf(v: ICAL.Component, tz: string): string | null {
	const r = v.getFirstPropertyValue('rrule');
	if (!r) return null;
	const s = String(r.toString())
		.replace(/^RRULE:/i, '')
		// a date-only UNTIL means "through that local day"
		.replace(/UNTIL=(\d{4})(\d{2})(\d{2})(?![\dT])/i, (_, y, m, d) => {
			const end = endOfLocalDay(`${y}-${m}-${d}`, tz);
			return `UNTIL=${end.replace(/[-:]|\.\d+/g, '')}`;
		});
	validateRrule(s);
	return s;
}

const tzParam = (p: ICAL.Property | null) => {
	const z = p?.getParameter('tzid');
	return typeof z === 'string' ? z : undefined;
};

function convert(v: ICAL.Component, tz: string, deadline: number): ParsedEvent {
	const start = v.getFirstPropertyValue('dtstart') as ICAL.Time | null;
	if (!start) throw new Error('No start');
	const endT = v.getFirstPropertyValue('dtend') as ICAL.Time | null;
	const dur = v.getFirstPropertyValue('duration') as ICAL.Duration | null;
	const tzidOf = (p: string) => tzParam(v.getFirstProperty(p));
	const allDay = start.isDate;

	let startAt: string;
	let endAt: string;
	if (allDay) {
		// DTEND is exclusive, as is end_at
		const s = dayKey(start);
		let e = endT ? dayKey(endT) : '';
		if (!e || e <= s) {
			const days = dur ? Math.max(1, Math.ceil(dur.toSeconds() / 86400)) : 1;
			e = new Date(Date.parse(s) + days * DAY).toISOString().slice(0, 10);
		}
		[startAt, endAt] = [startOfLocalDay(s, tz), startOfLocalDay(e, tz)];
	} else {
		const s = instant(start, tzidOf('dtstart'), tz);
		let e = endT ? instant(endT, tzidOf('dtend'), tz) : s + (dur ? dur.toSeconds() * 1000 : HOUR);
		if (!(e > s)) e = s + HOUR;
		[startAt, endAt] = [toIso(s), toIso(e)];
	}
	toIso(Date.parse(startAt)); // range check for the all-day branch too

	let rrule: string | null = null;
	let simplified = false;
	if (v.hasProperty('rrule')) {
		try {
			rrule = rruleOf(v, tz);
			const t0 = Date.parse(startAt);
			if (
				Date.now() > deadline ||
				t0 < Date.now() - MAX_SERIES_AGE ||
				![YEAR, IMPOSSIBLE_WINDOW].some(
					(w) =>
						expandOccurrences(rrule!, startAt, startAt, toIso(t0 + w), tz, PROBE_MAX_READS).length
				)
			)
				throw new Error('unsupported');
		} catch {
			rrule = null;
			simplified = true; // unsupported FREQ or unparseable: keep the first occurrence only
		}
	}

	const exdates = new Set<string>();
	let ignoredExdates = 0;
	const add = (x: string) => {
		const inSpan = x >= startAt && Date.parse(x) <= Date.parse(startAt) + EXDATE_SPAN;
		if (inSpan && exdates.size < MAX_EXDATES) exdates.add(x);
		else ignoredExdates++;
	};
	for (const p of rrule ? v.getAllProperties('exdate') : []) {
		const tzid = tzParam(p);
		for (const t of p.getValues() as ICAL.Time[]) {
			try {
				add(
					t.isDate
						? allDay
							? startOfLocalDay(dayKey(t), tz)
							: localToIso(dayKey(t), localTime(startAt, tz), tz)
						: toIso(instant(t, tzid, tz))
				);
			} catch {
				// an unreadable EXDATE only means that occurrence stays
			}
		}
	}

	const text = (p: string) => String(v.getFirstPropertyValue(p) ?? '').trim();
	const uid = text('uid').slice(0, 500);
	return {
		title: text('summary').slice(0, MAX_TITLE).trim() || '(No title)',
		notes: text('description'),
		location: text('location') || undefined,
		startAt,
		endAt,
		allDay,
		rrule,
		uid: uid || undefined,
		exdates: [...exdates],
		ignoredExdates,
		simplified
	};
}

/** Trust boundary: untrusted .ics text. Throws plain Errors with user-facing messages. */
export function parseIcs(text: string, tz: string): Parsed[] {
	if (text.length > MAX_ICS_BYTES) throw new Error('File too large (max 2 MB)');
	let vevents: ICAL.Component[];
	try {
		const root = new ICAL.Component(ICAL.parse(text) as unknown[]);
		if (root.name !== 'vcalendar') throw new Error();
		ICAL.TimezoneService.reset();
		for (const z of root.getAllSubcomponents('vtimezone'))
			ICAL.TimezoneService.register(new ICAL.Timezone(z));
		vevents = root.getAllSubcomponents('vevent');
	} catch {
		throw new Error(UNREADABLE);
	}
	if (vevents.length > MAX_EVENTS) throw new Error('Too many events');
	const deadline = Date.now() + CPU_BUDGET_MS;
	return vevents.map((v): Parsed => {
		try {
			return v.hasProperty('recurrence-id') ? { skip: 'override' } : convert(v, tz, deadline);
		} catch {
			return { skip: 'invalid' };
		}
	});
}

export interface ImportResult {
	created: number;
	skipped: number;
	/** Recurring events imported as a single occurrence because their rule is unsupported. */
	simplified: number;
	/** EXDATEs dropped: over the per-event cap, or far outside the series. */
	ignoredExdates: number;
}

/** All-or-nothing import; events whose UID is already stored are skipped. */
export function importIcs(db: Db, text: string, tz: string): ImportResult {
	const parsed = parseIcs(text, tz);
	return db.transaction(() => {
		const known = new Set(
			db
				.select({ uid: events.icsUid })
				.from(events)
				.where(isNotNull(events.icsUid))
				.all()
				.map((r) => r.uid)
		);
		const deadline = Date.now() + CPU_BUDGET_MS;
		const res: ImportResult = { created: 0, skipped: 0, simplified: 0, ignoredExdates: 0 };
		for (const p of parsed) {
			if ('skip' in p || (p.uid && known.has(p.uid))) {
				res.skipped++;
				continue;
			}
			const ev = createEvent(db, p, tz);
			if (p.uid) {
				db.update(events).set({ icsUid: p.uid }).where(eq(events.id, ev.id)).run();
				known.add(p.uid);
			}
			res.ignoredExdates += p.ignoredExdates;
			if (Date.now() > deadline) res.ignoredExdates += p.exdates.length;
			else if (ev.rrule && p.exdates.length) {
				// one expansion validates every EXDATE; ones matching no occurrence are ignored
				const sorted = [...p.exdates].sort();
				const last = new Date(Date.parse(sorted.at(-1)!) + 1).toISOString();
				const occ = new Set(expandOccurrences(ev.rrule, ev.startAt, sorted[0], last, tz));
				occ.add(ev.startAt);
				const rows = sorted
					.filter((x) => occ.has(x))
					.map((originalStart) => ({ eventId: ev.id, originalStart, cancelled: true }));
				if (rows.length) db.insert(eventExceptions).values(rows).run();
			}
			res.created++;
			if (p.simplified) res.simplified++;
		}
		return res;
	});
}
