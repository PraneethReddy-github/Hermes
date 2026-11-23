import { describe, expect, it } from 'vitest';
import { isDay, layoutLanes, rangeDays, rangeLabel, segmentOn, stepDate } from './calendar';

const tz = 'Europe/Berlin';

describe('rangeDays', () => {
	it('week starts on the chosen weekday', () => {
		// 2026-11-25 is a Wednesday
		expect(rangeDays('week', '2026-11-25', 1)[0]).toBe('2026-11-23');
		expect(rangeDays('week', '2026-11-25', 0)[0]).toBe('2026-11-22');
		expect(rangeDays('week', '2026-11-22', 1)[0]).toBe('2026-11-16'); // Sunday belongs to the Mon-start week before
	});
	it('month covers whole weeks', () => {
		const d = rangeDays('month', '2026-11-10', 1); // 1 Nov is a Sunday, 30 Nov a Monday
		expect(d[0]).toBe('2026-10-26');
		expect(d.at(-1)).toBe('2026-12-06');
		expect(d.length % 7).toBe(0);
	});
	it('agenda, day, 3day', () => {
		expect(rangeDays('agenda', '2026-12-25', 1, 20)).toHaveLength(20);
		expect(rangeDays('3day', '2026-12-30', 1)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
		expect(rangeDays('day', '2026-12-30', 1)).toEqual(['2026-12-30']);
	});
});

describe('stepDate / label', () => {
	it('steps by view size, month to the first', () => {
		expect(stepDate('week', '2026-11-25', 1)).toBe('2026-12-02');
		expect(stepDate('month', '2026-12-31', 1)).toBe('2027-01-01');
		expect(stepDate('month', '2026-01-15', -1)).toBe('2025-12-01');
	});
	it('labels', () => {
		expect(rangeLabel('month', '2026-11-10', rangeDays('month', '2026-11-10', 1))).toBe(
			'November 2026'
		);
		expect(rangeLabel('week', '2026-11-25', rangeDays('week', '2026-11-25', 1))).toBe(
			'23 – 29 Nov'
		);
	});
});

describe('segmentOn', () => {
	const ev = { startAt: '2026-11-23T22:00:00Z', endAt: '2026-11-25T09:30:00Z', allDay: false };
	it('clips a multi-day event to each local day', () => {
		// Berlin = UTC+1: 23:00 on the 23rd to 10:30 on the 25th
		expect(segmentOn('2026-11-23', ev, tz)).toMatchObject({
			startMin: 1380,
			endMin: 1440,
			startsHere: true
		});
		expect(segmentOn('2026-11-24', ev, tz)).toMatchObject({
			startMin: 0,
			endMin: 1440,
			startsHere: false
		});
		expect(segmentOn('2026-11-25', ev, tz)).toMatchObject({
			startMin: 0,
			endMin: 630,
			endsHere: true
		});
		expect(segmentOn('2026-11-26', ev, tz)).toBeNull();
	});
	it('an end at local midnight stays on the day before', () => {
		const e = { startAt: '2026-11-23T21:00:00Z', endAt: '2026-11-23T23:00:00Z', allDay: false };
		expect(segmentOn('2026-11-23', e, tz)).toMatchObject({ startMin: 1320, endMin: 1440 });
		expect(segmentOn('2026-11-24', e, tz)).toBeNull();
	});
});

describe('layoutLanes', () => {
	it('overlapping items share a cluster, later ones reuse free lanes', () => {
		const out = layoutLanes([
			{ startMin: 60, endMin: 120 },
			{ startMin: 90, endMin: 150 },
			{ startMin: 120, endMin: 180 }, // free lane 0 again, same cluster
			{ startMin: 300, endMin: 360 } // separate cluster
		]);
		expect(out.map((o) => [o.lane, o.lanes])).toEqual([
			[0, 2],
			[1, 2],
			[0, 2],
			[0, 1]
		]);
	});
	it('a short item still blocks 30 minutes', () => {
		const out = layoutLanes([
			{ startMin: 60, endMin: 70 },
			{ startMin: 80, endMin: 100 }
		]);
		expect(out.map((o) => o.lanes)).toEqual([2, 2]);
	});
});

describe('isDay', () => {
	it('accepts real days only, within 1970-2100', () => {
		for (const ok of ['2026-11-23', '2028-02-29', '1970-01-01', '2100-12-31'])
			expect(isDay(ok)).toBe(true);
		for (const bad of [
			'2026-13-45',
			'0000-00-00',
			'2026-00-10',
			'2026-02-30',
			'2027-02-29',
			'9999-12-31',
			'1969-12-31',
			'2026-1-5',
			'',
			null
		])
			expect(isDay(bad)).toBe(false);
	});
});
