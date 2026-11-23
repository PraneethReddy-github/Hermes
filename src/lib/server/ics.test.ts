import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createTestDb } from './db/test-utils';
import { events } from './db/schema';
import { importIcs, parseIcs, MAX_ICS_BYTES, type ParsedEvent } from './ics';
import { listOccurrences } from './services/events';

const TZ = 'Europe/Berlin';
const fixture = readFileSync(new URL('./ics.fixture.ics', import.meta.url), 'utf8');
const vcal = (...vevents: string[]) =>
	['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//EN', ...vevents, 'END:VCALENDAR'].join('\r\n');
const vevent = (...lines: string[]) =>
	['BEGIN:VEVENT', 'DTSTAMP:20260901T000000Z', ...lines, 'END:VEVENT'].join('\r\n');
const one = (...lines: string[]) => parseIcs(vcal(vevent(...lines)), TZ)[0] as ParsedEvent;
const starts = (db: ReturnType<typeof createTestDb>) =>
	listOccurrences(db, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', TZ).map(
		(o) => o.startAt
	);

describe('parseIcs', () => {
	it('parses timed, all-day and recurring events from the fixture', () => {
		const p = parseIcs(fixture, TZ) as ParsedEvent[];
		expect(p).toHaveLength(3);
		// 10:15 CEST (UTC+2)
		expect(p[0]).toMatchObject({
			title: 'Algorithms lecture',
			location: 'Room 2.01',
			startAt: '2026-09-15T08:15:00.000Z',
			endAt: '2026-09-15T09:45:00.000Z',
			uid: 'lecture-1@uni.example',
			allDay: false
		});
		// all-day: local midnights, end exclusive
		expect(p[1]).toMatchObject({
			allDay: true,
			startAt: '2026-12-23T23:00:00.000Z',
			endAt: '2026-12-25T23:00:00.000Z'
		});
		// 09:00 CET (UTC+1)
		expect(p[2]).toMatchObject({
			rrule: 'FREQ=WEEKLY;COUNT=4',
			startAt: '2026-11-02T08:00:00.000Z',
			exdates: ['2026-11-09T08:00:00.000Z']
		});
	});

	it('reads floating times in the user timezone and Z times as UTC', () => {
		expect(one('UID:f', 'DTSTART:20260701T090000', 'DTEND:20260701T100000').startAt).toBe(
			'2026-07-01T07:00:00.000Z'
		);
		expect(one('UID:z', 'DTSTART:20260701T090000Z', 'DTEND:20260701T100000Z').startAt).toBe(
			'2026-07-01T09:00:00.000Z'
		);
	});

	it('uses an IANA TZID without a VTIMEZONE, falling back to the user timezone for unknown names', () => {
		expect(one('DTSTART;TZID=America/New_York:20260701T090000').startAt).toBe(
			'2026-07-01T13:00:00.000Z'
		);
		expect(one('DTSTART;TZID=Not/AZone:20260701T090000').startAt).toBe('2026-07-01T07:00:00.000Z');
	});

	it('fills a missing end: DURATION, else 1 hour (timed) or 1 day (all-day)', () => {
		expect(one('DTSTART:20260701T090000Z', 'DURATION:PT90M').endAt).toBe(
			'2026-07-01T10:30:00.000Z'
		);
		expect(one('DTSTART:20260701T090000Z').endAt).toBe('2026-07-01T10:00:00.000Z');
		expect(one('DTSTART;VALUE=DATE:20260701').endAt).toBe('2026-07-01T22:00:00.000Z');
	});

	it('truncates long titles and names empty ones', () => {
		expect(one('DTSTART:20260701T090000Z', `SUMMARY:${'x'.repeat(300)}`).title).toHaveLength(200);
		expect(one('DTSTART:20260701T090000Z').title).toBe('(No title)');
	});

	it('turns a date-only UNTIL into the end of that local day', () => {
		const e = one('DTSTART:20260701T090000Z', 'RRULE:FREQ=DAILY;UNTIL=20260703');
		expect(e.rrule).toBe('FREQ=DAILY;UNTIL=20260703T215959Z');
		const db = createTestDb();
		importIcs(
			db,
			vcal(
				vevent(
					'UID:u',
					'DTSTART:20260701T090000',
					'DTEND:20260701T100000',
					'RRULE:FREQ=DAILY;UNTIL=20260703'
				)
			),
			TZ
		);
		expect(
			listOccurrences(db, '2026-07-01T00:00:00.000Z', '2026-07-10T00:00:00.000Z', TZ)
		).toHaveLength(3);
	});

	it('keeps EXDATE lists and all-day EXDATEs', () => {
		const e = one(
			'DTSTART;VALUE=DATE:20260701',
			'RRULE:FREQ=DAILY;COUNT=5',
			'EXDATE;VALUE=DATE:20260702,20260703'
		);
		expect(e.exdates).toEqual(['2026-07-01T22:00:00.000Z', '2026-07-02T22:00:00.000Z']);
	});

	it('flags unsupported FREQ as simplified, with no rule or exdates', () => {
		const e = one(
			'DTSTART:20260701T090000Z',
			'RRULE:FREQ=HOURLY;COUNT=3',
			'EXDATE:20260701T100000Z'
		);
		expect(e).toMatchObject({ rrule: null, simplified: true, exdates: [] });
	});

	it('marks RECURRENCE-ID overrides and broken events as skipped', () => {
		const p = parseIcs(
			vcal(
				vevent('UID:o', 'DTSTART:20260701T090000Z', 'RECURRENCE-ID:20260701T090000Z'),
				vevent('UID:bad', 'SUMMARY:no start')
			),
			TZ
		);
		expect(p).toEqual([{ skip: 'override' }, { skip: 'invalid' }]);
	});

	it('rejects oversize, malformed and too-large files with plain errors', () => {
		expect(() => parseIcs('x'.repeat(MAX_ICS_BYTES + 1), TZ)).toThrow('File too large');
		expect(() => parseIcs('hello', TZ)).toThrow('Could not read this calendar file');
		expect(() => parseIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VCALENDAR', TZ)).toThrow(
			'Could not read this calendar file'
		);
		const many = vcal(
			...Array.from({ length: 2001 }, (_, i) => vevent(`UID:${i}`, 'DTSTART:20260701T090000Z'))
		);
		expect(() => parseIcs(many, TZ)).toThrow('Too many events');
	});
});

describe('importIcs', () => {
	it('creates events, then skips them all on a second import', () => {
		const db = createTestDb();
		expect(importIcs(db, fixture, TZ)).toEqual({
			created: 3,
			skipped: 0,
			simplified: 0,
			ignoredExdates: 0
		});
		expect(importIcs(db, fixture, TZ)).toEqual({
			created: 0,
			skipped: 3,
			simplified: 0,
			ignoredExdates: 0
		});
		expect(db.select().from(events).all()).toHaveLength(3);
	});

	it('cancels the excluded date', () => {
		const db = createTestDb();
		importIcs(db, fixture, TZ);
		const s = starts(db);
		expect(s).toContain('2026-11-02T08:00:00.000Z');
		expect(s).not.toContain('2026-11-09T08:00:00.000Z');
		expect(s).toContain('2026-11-16T08:00:00.000Z');
		expect(s).toContain('2026-11-23T08:00:00.000Z');
	});

	it('always creates events without a UID and ignores EXDATEs that are not occurrences', () => {
		const db = createTestDb();
		const text = vcal(
			vevent('DTSTART:20260701T090000Z', 'RRULE:FREQ=DAILY;COUNT=2', 'EXDATE:20260701T123000Z')
		);
		importIcs(db, text, TZ);
		expect(importIcs(db, text, TZ).created).toBe(1);
		expect(db.select().from(events).all()).toHaveLength(2);
	});

	it('imports an unsupported rule as one occurrence and reports it', () => {
		const db = createTestDb();
		const r = importIcs(
			db,
			vcal(vevent('UID:h', 'DTSTART:20260701T090000Z', 'RRULE:FREQ=HOURLY')),
			TZ
		);
		expect(r).toEqual({ created: 1, skipped: 0, simplified: 1, ignoredExdates: 0 });
		expect(db.select().from(events).get()!.rrule).toBeNull();
	});

	it('counts RECURRENCE-ID overrides as skipped', () => {
		const db = createTestDb();
		const text = vcal(
			vevent('UID:s', 'DTSTART:20260701T090000Z', 'RRULE:FREQ=DAILY'),
			vevent('UID:s', 'DTSTART:20260702T100000Z', 'RECURRENCE-ID:20260702T090000Z')
		);
		expect(importIcs(db, text, TZ)).toMatchObject({ created: 1, skipped: 1 });
	});

	it('imports nothing when the file is unreadable', () => {
		const db = createTestDb();
		expect(() => importIcs(db, 'garbage', TZ)).toThrow('Could not read this calendar file');
		expect(db.select().from(events).all()).toHaveLength(0);
	});

	it('bounds recurrence cost: many EXDATEs on an old series stay fast and are cancelled', () => {
		const db = createTestDb();
		const days = Array.from({ length: 400 }, (_, i) =>
			new Date(Date.UTC(2025, 0, 1 + i, 9)).toISOString().replace(/[-:]|\.\d+/g, '')
		);
		const text = vcal(
			vevent(
				'UID:old',
				'DTSTART:20000101T090000Z',
				'DTEND:20000101T100000Z',
				'RRULE:FREQ=DAILY',
				`EXDATE:${days.join(',')}`
			)
		);
		const t0 = Date.now();
		const r = importIcs(db, text, TZ);
		expect(Date.now() - t0).toBeLessThan(2000);
		expect(r).toMatchObject({ created: 1, simplified: 0, ignoredExdates: 0 });
		const s = new Set(
			listOccurrences(db, '2024-12-25T00:00:00.000Z', '2026-03-01T00:00:00.000Z', TZ).map(
				(o) => o.startAt
			)
		);
		expect(s.has('2024-12-31T09:00:00.000Z')).toBe(true);
		expect(
			days.every(
				(d) =>
					!s.has(
						d.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6.000Z')
					)
			)
		).toBe(true);
		expect(s.has('2026-02-10T09:00:00.000Z')).toBe(true); // day 401 is not excluded
	});

	it('imports series older than 30 years or with an impossible rule once', () => {
		const db = createTestDb();
		const t0 = Date.now();
		const r = importIcs(
			db,
			vcal(
				vevent('UID:a', 'DTSTART:19000101T090000Z', 'RRULE:FREQ=DAILY', 'EXDATE:19000102T090000Z'),
				vevent(
					'UID:b',
					'DTSTART:20260701T090000Z',
					'RRULE:FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30',
					'EXDATE:20260702T090000Z'
				)
			),
			TZ
		);
		expect(Date.now() - t0).toBeLessThan(10_000); // guards the multi-second step scan only; loose for CI load
		expect(r).toMatchObject({ created: 2, simplified: 2 });
		expect(
			db
				.select()
				.from(events)
				.all()
				.every((e) => e.rrule === null)
		).toBe(true);
	});

	it('caps EXDATEs per event and ignores ones far outside the series', () => {
		const e = one(
			'DTSTART:20260101T090000Z',
			'RRULE:FREQ=DAILY',
			`EXDATE:${Array.from({ length: 600 }, (_, i) => new Date(Date.UTC(2026, 0, 2 + i, 9)).toISOString().replace(/[-:]|\.\d+/g, '')).join(',')}`,
			'EXDATE:21000101T090000Z'
		);
		expect(e.exdates).toHaveLength(500);
		expect(e.ignoredExdates).toBe(101);
	});
});
