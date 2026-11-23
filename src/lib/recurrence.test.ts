import { describe, expect, it } from 'vitest';
import { expandOccurrences, nextOccurrenceAfter, splitRruleUntil } from './recurrence';

const tz = 'Europe/Berlin';

describe('nextOccurrenceAfter', () => {
	it('keeps 09:00 local across DST', () => {
		expect(
			nextOccurrenceAfter(
				'FREQ=WEEKLY;BYDAY=MO',
				'2027-03-22T08:00:00Z',
				'2027-03-23T00:00:00Z',
				tz
			)
		).toBe('2027-03-29T07:00:00.000Z');
	});
	it('weekly task due 23:59:59.999 local', () => {
		expect(
			nextOccurrenceAfter('FREQ=WEEKLY', '2026-11-02T22:59:59.999Z', '2026-11-23T10:00:00Z', tz)
		).toBe('2026-11-23T22:59:59.999Z');
	});
	it('is strictly after', () => {
		expect(
			nextOccurrenceAfter('FREQ=DAILY', '2026-11-02T08:00:00Z', '2026-11-03T08:00:00.000Z', tz)
		).toBe('2026-11-04T08:00:00.000Z');
	});
	it('returns null once the rule ends', () => {
		expect(
			nextOccurrenceAfter('FREQ=DAILY;COUNT=2', '2026-11-02T08:00:00Z', '2026-11-03T08:00:00Z', tz)
		).toBeNull();
	});
});

describe('expandOccurrences', () => {
	const d = '2026-11-02T08:00:00.000Z';
	it('range end exclusive, start inclusive', () => {
		expect(expandOccurrences('FREQ=DAILY', d, d, '2026-11-05T08:00:00.000Z', tz)).toEqual([
			'2026-11-02T08:00:00.000Z',
			'2026-11-03T08:00:00.000Z',
			'2026-11-04T08:00:00.000Z'
		]);
	});
	it('stays at local wall time over the DST change', () => {
		expect(
			expandOccurrences(
				'FREQ=DAILY',
				'2027-03-27T08:00:00Z',
				'2027-03-27T00:00:00Z',
				'2027-03-30T00:00:00Z',
				tz
			)
		).toEqual(['2027-03-27T08:00:00.000Z', '2027-03-28T07:00:00.000Z', '2027-03-29T07:00:00.000Z']);
	});
	it('honours UNTIL as a real UTC instant', () => {
		const r = splitRruleUntil('FREQ=DAILY', '2026-11-05T08:00:00.000Z');
		expect(expandOccurrences(r, d, d, '2026-12-01T00:00:00Z', tz)).toHaveLength(3);
	});
});

describe('splitRruleUntil', () => {
	it('adds UNTIL one second before', () => {
		expect(splitRruleUntil('FREQ=WEEKLY;BYDAY=MO', '2026-11-23T08:00:00.000Z')).toBe(
			'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261123T075959Z'
		);
	});
	it('replaces existing UNTIL and COUNT', () => {
		expect(splitRruleUntil('FREQ=DAILY;UNTIL=20300101T000000Z', '2026-11-23T08:00:00Z')).toBe(
			'FREQ=DAILY;UNTIL=20261123T075959Z'
		);
		expect(splitRruleUntil('FREQ=DAILY;COUNT=5', '2026-11-23T08:00:00Z')).toBe(
			'FREQ=DAILY;UNTIL=20261123T075959Z'
		);
	});
});

describe('scan budget', () => {
	it('gives up on a rule that never matches instead of scanning to year 9999', () => {
		const t0 = Date.now();
		const start = '2026-07-01T09:00:00.000Z';
		const rule = 'FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30';
		expect(expandOccurrences(rule, start, start, '2031-07-01T09:00:00.000Z', 'UTC')).toEqual([]);
		expect(Date.now() - t0).toBeLessThan(4000);
	});

	it('finds the next occurrence of a long-running daily series', () => {
		const next = nextOccurrenceAfter(
			'FREQ=DAILY',
			'1950-01-01T08:00:00.000Z',
			'2030-01-01T12:00:00.000Z',
			'Europe/Berlin'
		);
		expect(next).toBe('2030-01-02T08:00:00.000Z'); // 09:00 Berlin (CET)
	});
});

describe('date-only UNTIL', () => {
	it('includes the last day', () => {
		const out = expandOccurrences(
			'FREQ=DAILY;UNTIL=20260703',
			'2026-07-01T07:00:00.000Z',
			'2026-06-30T00:00:00.000Z',
			'2026-07-10T00:00:00.000Z',
			'Europe/Berlin'
		);
		expect(out).toHaveLength(3);
		expect(out[2]).toBe('2026-07-03T07:00:00.000Z');
	});
});
