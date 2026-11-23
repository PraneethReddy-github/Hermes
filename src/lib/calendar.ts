// Client-safe calendar maths. Every day is a YYYY-MM-DD key in the user's timezone.
import { TZDate } from '@date-fns/tz';
import { addLocalDays, localDayKey, localTime } from './time';

export type View = 'agenda' | 'day' | '3day' | 'week' | 'month';
export const VIEWS: readonly View[] = ['agenda', 'day', '3day', 'week', 'month'];
export const HOUR_PX = 56;
export const AGENDA_DAYS = 14;
export const MAX_AGENDA_DAYS = 90;
const MIN_VISUAL = 30; // shortest height a block gets in the grid, in minutes
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

const parts = (day: string) => day.split('-').map(Number) as [number, number, number];
const utc = (day: string) => {
	const [y, m, d] = parts(day);
	return Date.UTC(y, m - 1, d);
};

/** A real calendar day within 1970–2100 (anything else would overflow the date maths). */
export function isDay(s: string | null): s is string {
	if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const [y, m, d] = parts(s);
	if (y < 1970 || y > 2100) return false;
	const t = new Date(Date.UTC(y, m - 1, d));
	return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
/** 0 = Sunday. */
export const dow = (day: string) => new Date(utc(day)).getUTCDay();
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86400000);
export const weekdayShort = (day: string) => WEEKDAYS[dow(day)];
export const dayNum = (day: string) => parts(day)[2];
export const monthName = (day: string) => MONTHS[parts(day)[1] - 1];
export const monthShort = (day: string) => monthName(day).slice(0, 3);

/** First day of the month `n` months from `day`. */
export function addMonths(day: string, n: number): string {
	const [y, m] = parts(day);
	return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

const run = (from: string, n: number) => Array.from({ length: n }, (_, i) => addLocalDays(from, i));
const weekStartOf = (day: string, weekStart: 0 | 1) =>
	addLocalDays(day, -((dow(day) - weekStart + 7) % 7));

/** The visible local days of a view. */
export function rangeDays(view: View, date: string, weekStart: 0 | 1, agendaDays = AGENDA_DAYS) {
	if (view === 'agenda') return run(date, agendaDays);
	if (view === 'day') return [date];
	if (view === '3day') return run(date, 3);
	if (view === 'week') return run(weekStartOf(date, weekStart), 7);
	const first = addMonths(date, 0);
	const last = addLocalDays(addMonths(date, 1), -1);
	const from = weekStartOf(first, weekStart);
	return run(from, Math.ceil((daysBetween(from, last) + 1) / 7) * 7);
}

/** URL for a calendar state. */
export function calHref(view: View, date: string, days?: number): string {
	return `/calendar?view=${view}&date=${date}${days && days > AGENDA_DAYS ? `&days=${days}` : ''}`;
}

/** Date to show after stepping `dir` pages from `date`. */
export function stepDate(view: View, date: string, dir: 1 | -1): string {
	if (view === 'month') return addMonths(date, dir);
	const n = { agenda: AGENDA_DAYS, day: 1, '3day': 3, week: 7 }[view];
	return addLocalDays(date, dir * n);
}

export function rangeLabel(view: View, date: string, days: string[]): string {
	const [a, b] = [days[0], days[days.length - 1]];
	if (view === 'month') return `${monthName(date)} ${parts(date)[0]}`;
	if (view === 'day') return `${weekdayShort(a)} ${dayNum(a)} ${monthShort(a)}`;
	const from = monthShort(a) === monthShort(b) ? `${dayNum(a)}` : `${dayNum(a)} ${monthShort(a)}`;
	return `${from} – ${dayNum(b)} ${monthShort(b)}`;
}

export function minutesOfDay(iso: string, tz: string): number {
	const t = new TZDate(iso, tz);
	return t.getHours() * 60 + t.getMinutes();
}

export interface Segment {
	day: string;
	startMin: number;
	endMin: number;
	allDay: boolean;
	/** The real start / end falls on this day, so a drag may change it. */
	startsHere: boolean;
	endsHere: boolean;
}

/** The part of [startAt, endAt) that falls on `day`, clipped to 0–1440 minutes; null if none. */
export function segmentOn(
	day: string,
	o: { startAt: string; endAt: string; allDay: boolean },
	tz: string
): Segment | null {
	const first = localDayKey(o.startAt, tz);
	const last = localDayKey(new Date(Date.parse(o.endAt) - 1).toISOString(), tz); // an end at midnight belongs to the day before
	if (day < first || day > last) return null;
	const startsHere = day === first;
	const endsHere = day === last;
	return {
		day,
		allDay: o.allDay,
		startsHere,
		endsHere,
		startMin: o.allDay || !startsHere ? 0 : minutesOfDay(o.startAt, tz),
		endMin: o.allDay || !endsHere ? 1440 : minutesOfDay(o.endAt, tz) || 1440
	};
}

/** "09:00–10:00" or "All day". */
export function timeRange(o: { startAt: string; endAt: string; allDay: boolean }, tz: string) {
	return o.allDay ? 'All day' : `${localTime(o.startAt, tz)}–${localTime(o.endAt, tz)}`;
}

/** Column layout: items in an overlap cluster share the width, each in the first free lane. */
export function layoutLanes<T extends { startMin: number; endMin: number }>(
	items: T[]
): (T & { lane: number; lanes: number })[] {
	const out: (T & { lane: number; lanes: number })[] = [];
	let cluster: typeof out = [];
	let laneEnds: number[] = [];
	let clusterEnd = -1;
	const flush = () => {
		for (const c of cluster) c.lanes = laneEnds.length;
		cluster = [];
		laneEnds = [];
		clusterEnd = -1;
	};
	for (const it of [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)) {
		if (it.startMin >= clusterEnd) flush();
		const end = Math.max(it.endMin, it.startMin + MIN_VISUAL);
		let lane = laneEnds.findIndex((e) => e <= it.startMin);
		if (lane < 0) lane = laneEnds.length;
		laneEnds[lane] = end;
		clusterEnd = Math.max(clusterEnd, end);
		const placed = { ...it, lane, lanes: 0 };
		cluster.push(placed);
		out.push(placed);
	}
	flush();
	return out;
}
