import { TZDate } from '@date-fns/tz';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { eventExceptions, events, tasks, users } from '../db/schema';

export interface UserSettings {
	timezone: string;
	theme: 'system' | 'dark' | 'light';
	weekStart: 1 | 0;
}

const DEFAULTS = { theme: 'system', weekStart: 1 } as const;
const DEFAULT_TZ = 'Europe/Berlin';

export function getUserSettings(db: Db): UserSettings {
	const u = db.select().from(users).limit(1).get();
	let json: Partial<UserSettings> = {};
	try {
		json = (JSON.parse(u?.settingsJson ?? '{}') as Partial<UserSettings> | null) ?? {};
	} catch {
		// corrupt settings_json: fall back to defaults
	}
	return {
		timezone: u?.timezone ?? DEFAULT_TZ,
		theme: json.theme === 'dark' || json.theme === 'light' ? json.theme : DEFAULTS.theme,
		weekStart: json.weekStart === 0 ? 0 : DEFAULTS.weekStart
	};
}

/** The same wall-clock time in another zone. Dates and all-day items stay on their local day. */
function rewall(iso: string, from: string, to: string): string {
	const t = new TZDate(iso, from);
	return new Date(
		new TZDate(
			t.getFullYear(),
			t.getMonth(),
			t.getDate(),
			t.getHours(),
			t.getMinutes(),
			t.getSeconds(),
			t.getMilliseconds(),
			to
		).getTime()
	).toISOString();
}

/** An RRULE's UNTIL=...Z is an instant too: a date-pinned series must end on the same local day. */
const rewallRule = (r: string | null, from: string, to: string) =>
	r &&
	r.replace(
		/UNTIL=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/i,
		(_, y, mo, d, h, mi, s) =>
			`UNTIL=${rewall(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`, from, to).replace(/[-:]|\.\d+/g, '')}`
	);

/** Timed items keep their instant; date-only tasks, task start dates and all-day events keep their local day. */
function repin(db: Db, from: string, to: string): void {
	const re = (x: string | null) => x && rewall(x, from, to);
	for (const t of db.select().from(tasks).all()) {
		const pin = !t.dueHasTime;
		if (!t.startAt && !(pin && t.dueAt)) continue;
		db.update(tasks)
			.set({
				startAt: re(t.startAt),
				...(pin && { dueAt: re(t.dueAt), rrule: rewallRule(t.rrule, from, to) })
			})
			.where(eq(tasks.id, t.id))
			.run();
	}
	for (const e of db.select().from(events).where(eq(events.allDay, true)).all()) {
		db.update(events)
			.set({
				startAt: rewall(e.startAt, from, to),
				endAt: rewall(e.endAt, from, to),
				rrule: rewallRule(e.rrule, from, to)
			})
			.where(eq(events.id, e.id))
			.run();
		for (const x of db
			.select()
			.from(eventExceptions)
			.where(eq(eventExceptions.eventId, e.id))
			.all())
			db.update(eventExceptions)
				.set({
					originalStart: rewall(x.originalStart, from, to),
					startAt: re(x.startAt),
					endAt: re(x.endAt)
				})
				.where(eq(eventExceptions.id, x.id))
				.run();
	}
}

export function updateUserSettings(db: Db, patch: Partial<UserSettings>): UserSettings {
	const u = db.select().from(users).limit(1).get();
	if (!u) throw new Error('No user');
	if (patch.timezone !== undefined) {
		try {
			new Intl.DateTimeFormat('en', { timeZone: patch.timezone });
		} catch {
			throw new Error('Invalid timezone');
		}
	}
	if (patch.theme !== undefined && !['system', 'dark', 'light'].includes(patch.theme))
		throw new Error('Invalid theme');
	if (patch.weekStart !== undefined && patch.weekStart !== 0 && patch.weekStart !== 1)
		throw new Error('Invalid week start');
	const next = { ...getUserSettings(db), ...patch };
	let rest: Record<string, unknown> = {};
	try {
		rest = (JSON.parse(u.settingsJson) as Record<string, unknown> | null) ?? {};
	} catch {
		// corrupt settings_json is replaced
	}
	db.transaction(() => {
		if (next.timezone !== u.timezone) repin(db, u.timezone, next.timezone);
		db.update(users)
			.set({
				timezone: next.timezone,
				// merge: keys this module does not own must survive
				settingsJson: JSON.stringify({ ...rest, theme: next.theme, weekStart: next.weekStart })
			})
			.where(eq(users.id, u.id))
			.run();
	});
	return next;
}
