import { and, eq, gt, gte, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db';
import { eventExceptions, events, projects } from '../db/schema';
import { audit } from '../audit';
import { indexEntity, removeEntity } from '../search-index';
import { expandOccurrences, splitRruleUntil } from '../../recurrence';
import { cleanColor } from '../../swatches';
import { addLocalDays, localDayKey, localTime, startOfLocalDay } from '../../time';
import type { EventInput, EventOccurrence, RecurrenceScope } from '../../types';
import { getUserSettings } from './settings';
import { validateRrule } from './tasks';

export type Event = typeof events.$inferSelect;
type Exception = typeof eventExceptions.$inferSelect;

const MAX_TITLE = 200;
const DAY = 86400000;
// an explicit Z/offset is required: offset-less strings would parse in the process timezone
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ms = (iso: string) => Date.parse(iso);
const plus = (iso: string, delta: number) => new Date(ms(iso) + delta).toISOString();

function toIso(v: unknown): string {
	const m = typeof v === 'string' ? ISO.exec(v) : null;
	const t = m ? Date.parse(v as string) : NaN;
	if (m) {
		// reject rollover (Feb 31, hour 24) by round-tripping the date and time parts
		const [y, mo, d, h, mi, sec] = m.slice(1, 7).map((n) => Number(n ?? 0));
		const r = new Date(Date.UTC(y, mo - 1, d, h, mi, sec));
		if (
			r.getUTCMonth() !== mo - 1 ||
			r.getUTCDate() !== d ||
			r.getUTCHours() !== h ||
			r.getUTCMinutes() !== mi ||
			r.getUTCSeconds() !== sec
		)
			throw new Error('Invalid date');
	}
	if (Number.isNaN(t)) throw new Error('Invalid date');
	return new Date(t).toISOString();
}

function checkTitle(title: string): string {
	const t = title.trim();
	if (!t) throw new Error('Add a title');
	if (t.length > MAX_TITLE) throw new Error(`Title too long (max ${MAX_TITLE})`);
	return t;
}

/** Validated [start, end); all-day spans are pinned to local midnights, end exclusive. */
function span(startAt: string, endAt: string, allDay: boolean, tz: string): [string, string] {
	const [s, e] = [toIso(startAt), toIso(endAt)];
	if (e <= s) throw new Error('End must be after start');
	if (!allDay) return [s, e];
	const lastDay = localDayKey(plus(e, -1), tz); // an end exactly at midnight belongs to the day before
	return [startOfLocalDay(localDayKey(s, tz), tz), startOfLocalDay(addLocalDays(lastDay, 1), tz)];
}

/** Trust boundary: full validation of a complete event, returning the columns to store. */
function clean(db: Db, f: EventInput, tz: string) {
	const [startAt, endAt] = span(f.startAt, f.endAt, f.allDay ?? false, tz);
	if (f.rrule !== undefined && f.rrule !== null) validateRrule(f.rrule); // '' is invalid, not "none"
	if (f.projectId && !db.select().from(projects).where(eq(projects.id, f.projectId)).get())
		throw new Error('Project not found');
	return {
		title: checkTitle(f.title),
		notes: f.notes ?? '',
		location: f.location?.trim() || null,
		startAt,
		endAt,
		allDay: f.allDay ?? false,
		rrule: f.rrule ?? null,
		color: cleanColor(f.color),
		projectId: f.projectId ?? null
	};
}

const asInput = (e: Event): EventInput => ({ ...e, location: e.location ?? undefined });

function reindex(db: Db, e: Event): void {
	indexEntity(db, 'event', e.id, e.title, [e.location, e.notes].filter(Boolean).join(' '));
}

function row(db: Db, id: string): Event {
	const e = db.select().from(events).where(eq(events.id, id)).get();
	if (!e || e.deletedAt) throw new Error('Event not found');
	return e;
}

export function getEvent(db: Db, id: string): Event | undefined {
	return db
		.select()
		.from(events)
		.where(and(eq(events.id, id), isNull(events.deletedAt)))
		.get();
}

export function createEvent(db: Db, input: EventInput, tz = getUserSettings(db).timezone): Event {
	return db.transaction(() => {
		const e = db
			.insert(events)
			.values(clean(db, input, tz))
			.returning()
			.get();
		reindex(db, e);
		return e;
	});
}

/** End of an occurrence starting at `start`: all-day series keep their whole-day length across DST. */
function endFor(ev: Event, start: string, tz: string): string {
	if (!ev.allDay) return plus(start, ms(ev.endAt) - ms(ev.startAt));
	const days = Math.round(
		(Date.parse(localDayKey(ev.endAt, tz)) - Date.parse(localDayKey(ev.startAt, tz))) / DAY
	);
	return startOfLocalDay(addLocalDays(localDayKey(start, tz), days), tz);
}

const isOccurrence = (ev: Event, start: string, tz: string) =>
	expandOccurrences(ev.rrule!, ev.startAt, start, plus(start, 1), tz).length === 1;

/** Validated ISO instant that really is an occurrence of this recurring series. */
function occurrenceOf(ev: Event, start: string | undefined, tz: string): string {
	if (!start) throw new Error('Occurrence start required');
	const s = toIso(start);
	if (s !== ev.startAt && !isOccurrence(ev, s, tz)) throw new Error('Occurrence not found');
	return s;
}

export function listOccurrences(
	db: Db,
	rangeStart: string,
	rangeEnd: string,
	tz: string
): EventOccurrence[] {
	const [rs, re] = [toIso(rangeStart), toIso(rangeEnd)];
	const live = and(isNull(events.deletedAt), lt(events.startAt, re));
	const out: EventOccurrence[] = [];
	const push = (
		ev: Event,
		originalStart: string,
		ex: Exception | undefined,
		start: string,
		end: string
	) =>
		out.push({
			eventId: ev.id,
			title: ex?.title ?? ev.title,
			location: ex?.location ?? ev.location,
			color: ev.color,
			startAt: start,
			endAt: end,
			allDay: ev.allDay,
			originalStart,
			isRecurring: !!ev.rrule
		});

	for (const ev of db
		.select()
		.from(events)
		.where(and(live, isNull(events.rrule), gt(events.endAt, rs)))
		.all()) {
		push(ev, ev.startAt, undefined, ev.startAt, ev.endAt);
	}

	const series = db
		.select()
		.from(events)
		.where(and(live, isNotNull(events.rrule)))
		.all();
	const exs = series.length
		? db
				.select()
				.from(eventExceptions)
				.where(
					inArray(
						eventExceptions.eventId,
						series.map((s) => s.id)
					)
				)
				.all()
		: [];
	for (const ev of series) {
		const byOrig = new Map(exs.filter((x) => x.eventId === ev.id).map((x) => [x.originalStart, x]));
		const dur = ms(ev.endAt) - ms(ev.startAt);
		// overlap-aware window: an occurrence starting up to one duration before the range can still reach into it
		const origs = new Set(expandOccurrences(ev.rrule!, ev.startAt, plus(rs, -dur), re, tz));
		// a moved exception can land in range from an original start outside the window
		for (const x of byOrig.values())
			if (
				!x.cancelled &&
				x.startAt &&
				!origs.has(x.originalStart) &&
				x.startAt < re &&
				(x.endAt ?? endFor(ev, x.startAt, tz)) > rs &&
				isOccurrence(ev, x.originalStart, tz)
			)
				origs.add(x.originalStart);
		for (const orig of origs) {
			const ex = byOrig.get(orig);
			if (ex?.cancelled) continue;
			const start = ex?.startAt ?? orig;
			const end = ex?.endAt ?? endFor(ev, start, tz);
			if (start < re && end > rs) push(ev, orig, ex, start, end);
		}
	}
	return out.sort(
		(a, b) => a.startAt.localeCompare(b.startAt) || a.eventId.localeCompare(b.eventId)
	);
}

/** Insert or update the exception row for one occurrence (unique on event + original start). */
function upsertException(
	db: Db,
	eventId: string,
	originalStart: string,
	values: Partial<Pick<Exception, 'cancelled' | 'title' | 'startAt' | 'endAt' | 'location'>>
): void {
	const cur = db
		.select()
		.from(eventExceptions)
		.where(
			and(eq(eventExceptions.eventId, eventId), eq(eventExceptions.originalStart, originalStart))
		)
		.get();
	if (cur) db.update(eventExceptions).set(values).where(eq(eventExceptions.id, cur.id)).run();
	else
		db.insert(eventExceptions)
			.values({ eventId, originalStart, ...values })
			.run();
}

export function updateEvent(
	db: Db,
	id: string,
	patch: Partial<EventInput>,
	scope: RecurrenceScope,
	occurrenceStart?: string,
	tz = getUserSettings(db).timezone
): Event {
	return db.transaction(() => {
		const ev = row(db, id);
		if (!ev.rrule || scope === 'all') return updateSeries(db, ev, patch, tz);
		const orig = occurrenceOf(ev, occurrenceStart, tz);
		if (scope === 'following' && orig === ev.startAt) return updateSeries(db, ev, patch, tz);
		return scope === 'this'
			? updateOne(db, ev, patch, orig, tz)
			: updateFollowing(db, ev, patch, orig, tz);
	});
}

function updateSeries(db: Db, ev: Event, patch: Partial<EventInput>, tz: string): Event {
	const fields = clean(db, { ...asInput(ev), ...patch }, tz);
	// exceptions are keyed on original start times, so a moved series start would orphan them (and they could resurface later)
	if (fields.startAt !== ev.startAt)
		db.delete(eventExceptions).where(eq(eventExceptions.eventId, ev.id)).run();
	const next = db.update(events).set(fields).where(eq(events.id, ev.id)).returning().get();
	reindex(db, next);
	return next;
}

function updateOne(db: Db, ev: Event, patch: Partial<EventInput>, orig: string, tz: string): Event {
	const { title, location, startAt, endAt, ...rest } = patch;
	if (Object.values(rest).some((v) => v !== undefined))
		throw new Error('Only title, time and location can change for one occurrence');
	const ex = db
		.select()
		.from(eventExceptions)
		.where(and(eq(eventExceptions.eventId, ev.id), eq(eventExceptions.originalStart, orig)))
		.get();
	const values: Parameters<typeof upsertException>[3] = { cancelled: false };
	if (title !== undefined) values.title = checkTitle(title);
	if (location !== undefined) values.location = location.trim();
	if (startAt !== undefined || endAt !== undefined) {
		const curStart = ex?.startAt ?? orig;
		const curEnd = ex?.endAt ?? endFor(ev, curStart, tz);
		const start = startAt === undefined ? curStart : toIso(startAt);
		// moving only the start keeps the length
		const end = endAt !== undefined ? endAt : plus(start, ms(curEnd) - ms(curStart));
		[values.startAt, values.endAt] = span(start, end, ev.allDay, tz);
	}
	upsertException(db, ev.id, orig, values);
	return ev;
}

function updateFollowing(
	db: Db,
	ev: Event,
	patch: Partial<EventInput>,
	orig: string,
	tz: string
): Event {
	const startAt = patch.startAt ?? orig;
	const endAt = patch.endAt ?? endFor(ev, toIso(startAt), tz);
	let rrule = patch.rrule === undefined ? ev.rrule! : patch.rrule;
	const count = rrule === ev.rrule ? /COUNT=(\d+)/i.exec(rrule!)?.[1] : undefined;
	if (count) {
		const head = expandOccurrences(ev.rrule!, ev.startAt, ev.startAt, orig, tz).length;
		rrule = rrule!.replace(/COUNT=\d+/i, `COUNT=${Number(count) - head}`);
	}
	const fields = clean(db, { ...asInput(ev), ...patch, startAt, endAt, rrule }, tz);
	db.update(events)
		.set({ rrule: splitRruleUntil(ev.rrule!, orig) })
		.where(eq(events.id, ev.id))
		.run();
	const tail = db.insert(events).values(fields).returning().get();
	reindex(db, tail);

	// the exception at `orig` itself is superseded by the patch; later ones move only if the time of day is unchanged
	const at = (op: typeof gt) =>
		and(eq(eventExceptions.eventId, ev.id), op(eventExceptions.originalStart, orig));
	db.delete(eventExceptions)
		.where(and(eq(eventExceptions.eventId, ev.id), eq(eventExceptions.originalStart, orig)))
		.run();
	if (tail.rrule && localTime(tail.startAt, tz) === localTime(orig, tz))
		db.update(eventExceptions).set({ eventId: tail.id }).where(at(gt)).run();
	else db.delete(eventExceptions).where(at(gt)).run();
	return tail;
}

export function deleteEvent(
	db: Db,
	id: string,
	scope: RecurrenceScope,
	occurrenceStart?: string,
	tz = getUserSettings(db).timezone
): void {
	db.transaction(() => {
		const ev = row(db, id);
		const orig = ev.rrule && scope !== 'all' ? occurrenceOf(ev, occurrenceStart, tz) : undefined;
		if (orig && scope === 'this') return upsertException(db, id, orig, { cancelled: true });
		if (orig && orig !== ev.startAt) {
			db.update(events)
				.set({ rrule: splitRruleUntil(ev.rrule!, orig) })
				.where(eq(events.id, id))
				.run();
			db.delete(eventExceptions)
				.where(and(eq(eventExceptions.eventId, id), gte(eventExceptions.originalStart, orig)))
				.run();
			return;
		}
		db.update(events).set({ deletedAt: new Date().toISOString() }).where(eq(events.id, id)).run();
		removeEntity(db, 'event', id);
		audit(db, 'user', 'event.delete', 'event', id);
	});
}
