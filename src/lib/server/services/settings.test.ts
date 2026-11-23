import { describe, expect, it } from 'vitest';
import { createTestDb } from '../db/test-utils';
import { endOfLocalDay, localDayKey, startOfLocalDay } from '../../time';
import { createEvent, deleteEvent, getEvent, listOccurrences } from './events';
import { createTask, getTask } from './tasks';
import { users } from '../db/schema';
import { getUserSettings, updateUserSettings } from './settings';

const makeDb = (settingsJson: string) => {
	const db = createTestDb();
	db.insert(users).values({ username: 'a', passwordHash: 'x', settingsJson }).run();
	return db;
};

const rawJson = (db: ReturnType<typeof createTestDb>) =>
	JSON.parse(db.select().from(users).limit(1).get()!.settingsJson) as Record<string, unknown>;

describe('updateUserSettings', () => {
	it('keeps unknown settings_json keys when patching', () => {
		const db = makeDb('{"theme":"dark","extra":{"a":1}}');
		updateUserSettings(db, { weekStart: 0 });
		expect(rawJson(db)).toEqual({ theme: 'dark', weekStart: 0, extra: { a: 1 } });
		expect(getUserSettings(db)).toMatchObject({ theme: 'dark', weekStart: 0 });
	});

	it('replaces corrupt settings_json and validates input', () => {
		const db = makeDb('not json');
		expect(updateUserSettings(db, { theme: 'light', timezone: 'UTC' })).toMatchObject({
			theme: 'light',
			timezone: 'UTC'
		});
		expect(() => updateUserSettings(db, { weekStart: 2 as 1 })).toThrow('week start');
		expect(() => updateUserSettings(db, { timezone: 'Mars/Base' })).toThrow('timezone');
	});
});

describe('changing the timezone re-pins dates to the same local day', () => {
	const BERLIN = 'Europe/Berlin';
	it.each(['Pacific/Kiritimati', 'America/New_York'])('Berlin -> %s', (tz) => {
		const db = makeDb('{}');
		db.update(users).set({ timezone: BERLIN }).run();
		const dated = createTask(db, {
			title: 'dated',
			dueAt: endOfLocalDay('2026-11-27', BERLIN),
			startAt: startOfLocalDay('2026-11-25', BERLIN)
		});
		const timed = createTask(db, {
			title: 'timed',
			dueAt: '2026-11-27T08:30:00.000Z',
			dueHasTime: true
		});
		const day = createEvent(db, {
			title: 'day',
			startAt: startOfLocalDay('2026-12-01', BERLIN),
			endAt: startOfLocalDay('2026-12-03', BERLIN),
			allDay: true
		});
		const timedEv = createEvent(db, {
			title: 'timed ev',
			startAt: '2026-12-01T08:00:00.000Z',
			endAt: '2026-12-01T09:00:00.000Z'
		});
		const series = createEvent(db, {
			title: 'series',
			startAt: startOfLocalDay('2026-11-02', BERLIN),
			endAt: startOfLocalDay('2026-11-03', BERLIN),
			allDay: true,
			rrule: 'FREQ=WEEKLY'
		});
		deleteEvent(db, series.id, 'this', startOfLocalDay('2026-11-09', BERLIN));

		updateUserSettings(db, { timezone: tz });

		const t = getTask(db, dated.id)!;
		expect(t.dueAt).toBe(endOfLocalDay('2026-11-27', tz));
		expect(t.startAt).toBe(startOfLocalDay('2026-11-25', tz));
		expect(getTask(db, timed.id)!.dueAt).toBe('2026-11-27T08:30:00.000Z');
		const d = getEvent(db, day.id)!;
		expect([d.startAt, d.endAt]).toEqual([
			startOfLocalDay('2026-12-01', tz),
			startOfLocalDay('2026-12-03', tz)
		]);
		expect(getEvent(db, timedEv.id)!.startAt).toBe('2026-12-01T08:00:00.000Z');

		const days = listOccurrences(
			db,
			startOfLocalDay('2026-11-01', tz),
			startOfLocalDay('2026-12-01', tz),
			tz
		)
			.filter((o) => o.eventId === series.id)
			.map((o) => localDayKey(o.startAt, tz));
		expect(days).toEqual(['2026-11-02', '2026-11-16', '2026-11-23', '2026-11-30']); // the 9th stays cancelled
	});
});
