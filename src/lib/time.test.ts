import { describe, expect, it } from 'vitest';
import {
	addLocalDays,
	endOfLocalDay,
	formatDay,
	formatDue,
	localDayKey,
	localTime,
	localToIso,
	startOfLocalDay
} from './time';

const tz = 'Europe/Berlin';
const now = new Date('2026-11-23T10:00:00Z'); // Mon 23 Nov, 11:00 Berlin

describe('day helpers', () => {
	it('localDayKey uses the given tz', () => {
		expect(localDayKey('2027-03-28T21:30:00.000Z', tz)).toBe('2027-03-28');
		expect(localDayKey('2026-11-23T23:30:00.000Z', tz)).toBe('2026-11-24');
	});
	it('start/end of local day, incl. DST days', () => {
		expect(startOfLocalDay('2026-11-23', tz)).toBe('2026-11-22T23:00:00.000Z');
		expect(endOfLocalDay('2026-11-23', tz)).toBe('2026-11-23T22:59:59.999Z');
		expect(endOfLocalDay('2027-03-28', tz)).toBe('2027-03-28T21:59:59.999Z'); // CEST
		expect(startOfLocalDay('2027-03-29', tz)).toBe('2027-03-28T22:00:00.000Z');
	});
	it('addLocalDays crosses month/year, negative ok', () => {
		expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addLocalDays('2027-03-01', -1)).toBe('2027-02-28');
	});
});

describe('formatDue', () => {
	const f = (iso: string, t = false) => formatDue(iso, t, tz, now);
	it('today / tomorrow', () => {
		expect(f('2026-11-23T22:59:59.999Z')).toBe('today');
		expect(f('2026-11-24T22:59:59.999Z')).toBe('tomorrow');
		expect(f('2026-11-23T08:30:00.000Z', true)).toBe('today 09:30');
	});
	it('weekday within 6 days, with time', () => {
		expect(f('2026-11-27T22:59:00.000Z', true)).toBe('Fri 23:59');
		expect(f('2026-11-29T22:59:59.999Z')).toBe('Sun');
	});
	it('date beyond 6 days, year only when different', () => {
		expect(f('2026-12-24T22:59:59.999Z')).toBe('24 Dec');
		expect(f('2027-01-05T10:00:00.000Z')).toBe('5 Jan 2027');
	});
	it('past: weekday within 6 days, else date', () => {
		expect(f('2026-11-20T22:59:59.999Z')).toBe('Fri');
		expect(f('2025-12-24T22:59:59.999Z')).toBe('24 Dec 2025');
		expect(f('2026-11-10T10:00:00.000Z')).toBe('10 Nov');
	});
});

describe('form helpers', () => {
	it('localToIso reads the wall clock in the given tz, date-only means end of day', () => {
		expect(localToIso('2026-11-24', '09:30', tz)).toBe('2026-11-24T08:30:00.000Z');
		expect(localToIso('2026-07-01', '09:30', tz)).toBe('2026-07-01T07:30:00.000Z');
		expect(localToIso('2026-11-24', null, tz)).toBe('2026-11-24T22:59:59.999Z');
	});
	it('localTime inverts localToIso', () => {
		expect(localTime('2026-11-24T08:30:00.000Z', tz)).toBe('09:30');
	});
	it('formatDay: Tomorrow, else weekday day month', () => {
		expect(formatDay('2026-11-24', '2026-11-23')).toBe('Tomorrow');
		expect(formatDay('2026-11-25', '2026-11-23')).toBe('Wed 25 Nov');
	});
});
