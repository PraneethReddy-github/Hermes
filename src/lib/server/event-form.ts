import type { EventInput, EventOccurrence, RecurrenceScope } from '../types';
import { addLocalDays, localDayKey, localToIso, startOfLocalDay } from '../time';
import { daysBetween, minutesOfDay } from '../calendar';
import { field } from './form';
import { TIME, dayField } from './task-form';
import type { Db } from './db';
import { listOccurrences, type Event } from './services/events';

export function scopeField(f: FormData): RecurrenceScope {
	const s = field(f, 'scope');
	if (s !== 'this' && s !== 'following' && s !== 'all') throw new Error('Invalid scope');
	return s;
}

function timeField(f: FormData, key: string): string {
	const t = field(f, key).trim();
	if (!TIME.test(t)) throw new Error('Invalid time');
	return t;
}

function span(startDay: string, endDay: string, f: FormData, allDay: boolean, tz: string) {
	if (allDay)
		return {
			startAt: startOfLocalDay(startDay, tz),
			endAt: startOfLocalDay(addLocalDays(endDay, 1), tz)
		};
	return {
		startAt: localToIso(startDay, timeField(f, 'startTime'), tz),
		endAt: localToIso(endDay, timeField(f, 'endTime'), tz)
	};
}

/** The occurrence as it is now (exceptions applied), found server-side from the posted instant. */
export function currentOccurrence(
	db: Db,
	id: string,
	occurrenceStart: string,
	originalStart: string,
	tz: string
): EventOccurrence {
	const t = Date.parse(occurrenceStart);
	if (Number.isNaN(t)) throw new Error('Occurrence not found');
	const cur = listOccurrences(
		db,
		new Date(t).toISOString(),
		new Date(t + 1).toISOString(),
		tz
	).find((o) => o.eventId === id && o.originalStart === originalStart);
	if (!cur) throw new Error('Occurrence not found');
	return cur;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `base` moved by the same local-clock change that takes `from` to `to` (days and minutes, DST-proof). */
function shiftWall(base: string, from: string, to: string, tz: string): string {
	const days = daysBetween(localDayKey(from, tz), localDayKey(to, tz));
	const m = minutesOfDay(base, tz) + minutesOfDay(to, tz) - minutesOfDay(from, tz);
	const carry = Math.floor(m / 1440);
	const mm = m - carry * 1440;
	const day = addLocalDays(localDayKey(base, tz), days + carry);
	return localToIso(day, `${pad(Math.floor(mm / 60))}:${pad(mm % 60)}`, tz);
}

/**
 * Event form → patch. Dates and times are local strings, converted with the user's tz.
 * Fields missing from the form are left out, so the drag-and-drop post can send times only.
 * `ev` is the stored event when editing and `cur` the occurrence being edited (recurring events):
 * values equal to the occurrence's current ones are left out, so an untouched field never becomes
 * an override, and a series edit moves the series start by the change made to the occurrence.
 */
export function eventPatchFromForm(
	f: FormData,
	tz: string,
	scope: RecurrenceScope,
	ev?: Event,
	cur?: EventOccurrence
): Partial<EventInput> {
	const one = scope === 'this' && !!ev;
	const allDay = one
		? ev.allDay
		: f.has('allDay')
			? field(f, 'allDay') === '1'
			: (ev?.allDay ?? false);
	const startDay = dayField(f, 'startDate');
	if (!startDay) throw new Error('Pick a start date');
	const endDay = dayField(f, 'endDate') || startDay;
	const times = span(startDay, endDay, f, allDay, tz);
	const patch: Partial<EventInput> = {};
	const recurring = !!ev?.rrule && !!cur;
	if (!recurring) Object.assign(patch, times);
	else if (times.startAt !== cur.startAt || times.endAt !== cur.endAt) {
		if (scope === 'all' && allDay === ev.allDay) {
			patch.startAt = shiftWall(ev.startAt, cur.startAt, times.startAt, tz);
			patch.endAt = shiftWall(ev.endAt, cur.endAt, times.endAt, tz);
		} else if (scope === 'all') {
			// all-day flipped: the posted times replace the series' on its own first day
			const shift = daysBetween(localDayKey(cur.startAt, tz), startDay);
			const first = addLocalDays(localDayKey(ev.startAt, tz), shift);
			Object.assign(
				patch,
				span(first, addLocalDays(first, daysBetween(startDay, endDay)), f, allDay, tz)
			);
		} else Object.assign(patch, times);
	}
	if (f.has('title') && !(recurring && field(f, 'title') === cur.title))
		patch.title = field(f, 'title');
	if (f.has('location') && !(recurring && field(f, 'location') === (cur.location ?? '')))
		patch.location = field(f, 'location');
	if (one) return patch; // one occurrence: only title, location and times
	patch.allDay = allDay;
	if (f.has('notes')) patch.notes = field(f, 'notes');
	if (f.has('color')) patch.color = field(f, 'color') || null;
	if (f.has('repeat'))
		patch.rrule = field(f, 'repeat') === 'custom' ? field(f, 'rrule') : field(f, 'repeat') || null;
	return patch;
}
