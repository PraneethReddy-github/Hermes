import { TZDate } from '@date-fns/tz';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parseDay = (day: string) => day.split('-').map(Number) as [number, number, number];
const dayMs = (day: string) => {
	const [y, m, d] = parseDay(day);
	return Date.UTC(y, m - 1, d);
};

/** Local calendar day (YYYY-MM-DD) of an instant in `tz`. */
export function localDayKey(iso: string, tz: string): string {
	const t = new TZDate(iso, tz);
	return `${pad(t.getFullYear(), 4)}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function localToUtc(day: string, tz: string, h: number, mi: number, s: number, ms: number) {
	const [y, m, d] = parseDay(day);
	return new Date(new TZDate(y, m - 1, d, h, mi, s, ms, tz).getTime()).toISOString();
}

export const startOfLocalDay = (day: string, tz: string) => localToUtc(day, tz, 0, 0, 0, 0);
export const endOfLocalDay = (day: string, tz: string) => localToUtc(day, tz, 23, 59, 59, 999);

export function addLocalDays(day: string, n: number): string {
	return new Date(dayMs(day) + n * 86400000).toISOString().slice(0, 10);
}

/** Short English due label: today / tomorrow / Fri / 24 Dec / 24 Dec 2025, plus HH:mm when hasTime. */
export function formatDue(iso: string, hasTime: boolean, tz: string, now: Date | string): string {
	const day = localDayKey(iso, tz);
	const today = localDayKey(new Date(now).toISOString(), tz);
	const diff = Math.round((dayMs(day) - dayMs(today)) / 86400000);
	const [y, m, d] = parseDay(day);
	let label: string;
	if (diff === 0) label = 'today';
	else if (diff === 1) label = 'tomorrow';
	else if (Math.abs(diff) <= 6) label = WEEKDAYS[new Date(dayMs(day)).getUTCDay()];
	else label = `${d} ${MONTHS[m - 1]}` + (y === parseDay(today)[0] ? '' : ` ${y}`);
	if (!hasTime) return label;
	const t = new TZDate(iso, tz);
	return `${label} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

/** HH:mm wall-clock time of an instant in `tz`. */
export function localTime(iso: string, tz: string): string {
	const t = new TZDate(iso, tz);
	return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

/** UTC instant of a local day plus optional HH:mm; no time means the end of that day. */
export function localToIso(day: string, time: string | null, tz: string): string {
	if (!time) return endOfLocalDay(day, tz);
	const [h, mi] = time.split(':').map(Number);
	return localToUtc(day, tz, h, mi, 0, 0);
}

/** Group header for a local day: Tomorrow, or Wed 25 Nov. */
export function formatDay(day: string, today: string): string {
	if (day === addLocalDays(today, 1)) return 'Tomorrow';
	const [, m, d] = parseDay(day);
	return `${WEEKDAYS[new Date(dayMs(day)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
