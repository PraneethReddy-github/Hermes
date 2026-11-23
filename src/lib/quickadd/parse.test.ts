import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './parse';

const now = new Date('2026-11-23T10:00:00Z'); // Monday
const base = { now, timeZone: 'Europe/Berlin', projectNames: ['Uni', 'Personal', 'Office Move'] };
const p = (input: string, o: Partial<typeof base> = {}) => parseQuickAdd(input, { ...base, ...o });

describe('parseQuickAdd', () => {
	it('parses the full example', () => {
		const r = p('SCAD report +Uni #assignment !3 fri 23:59 ~4h');
		expect(r).toMatchObject({
			title: 'SCAD report',
			projectName: 'Uni',
			labels: ['assignment'],
			priority: 3,
			dueAt: '2026-11-27T22:59:00.000Z',
			dueHasTime: true,
			estimateMin: 240
		});
	});

	it('date-only due is end of local day', () => {
		expect(p('Pay rent tomorrow')).toMatchObject({
			title: 'Pay rent',
			dueAt: '2026-11-24T22:59:59.999Z',
			dueHasTime: false
		});
	});

	it('parses German', () => {
		expect(p('Lesen morgen 14 Uhr')).toMatchObject({
			title: 'Lesen',
			dueAt: '2026-11-24T13:00:00.000Z',
			dueHasTime: true
		});
	});

	it('parses day-first numeric dates', () => {
		expect(p('Hand in 24.12.')).toMatchObject({
			dueAt: '2026-12-24T22:59:59.999Z',
			dueHasTime: false
		});
		expect(p('Hand in 24.12.2027 18:00')).toMatchObject({
			dueAt: '2027-12-24T17:00:00.000Z',
			dueHasTime: true
		});
		expect(p('Hand in 3/4')).toMatchObject({ dueAt: '2027-04-03T21:59:59.999Z' });
		expect(p('Hand in 3.4.')).toMatchObject({ dueAt: '2027-04-03T21:59:59.999Z' });
	});

	it('parses repeats', () => {
		expect(p('Gym every mon')).toMatchObject({ title: 'Gym', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
		expect(p('Water plants every 2 days').rrule).toBe('FREQ=DAILY;INTERVAL=2');
		expect(p('Backup jeden Freitag').rrule).toBe('FREQ=WEEKLY;BYDAY=FR');
		expect(p('Review every week').rrule).toBe('FREQ=WEEKLY');
		expect(p('Rent jeden Monat').rrule).toBe('FREQ=MONTHLY');
		expect(p('Sport jeden Mittwoch').rrule).toBe('FREQ=WEEKLY;BYDAY=WE');
	});

	it('parses quoted and plain project names', () => {
		expect(p('Pack +"Office Move" ~30m')).toMatchObject({
			projectName: 'Office Move',
			estimateMin: 30,
			title: 'Pack'
		});
		expect(p('x +uni').projectName).toBe('Uni');
	});

	it('warns on unknown project', () => {
		const r = p('Call +Nope');
		expect(r.projectName).toBeUndefined();
		expect(r.title).toBe('Call');
		expect(r.chips.some((c) => c.kind === 'warning')).toBe(true);
	});

	it('keeps quoted spans verbatim', () => {
		const r = p('"Read 1984 tomorrow"');
		expect(r.title).toBe('Read 1984 tomorrow');
		expect(r.dueAt).toBeUndefined();
	});

	it('allows an empty title', () => {
		expect(p('!3 tomorrow #x').title).toBe('');
		expect(p('   ')).toMatchObject({ title: '', chips: [] });
	});

	it('uses DST offset for the due date', () => {
		expect(p('Exam sun 23:30', { now: new Date('2027-03-22T10:00:00Z') }).dueAt).toBe(
			'2027-03-28T21:30:00.000Z'
		);
	});

	it('weekday today: today if no time or time ahead, else next week', () => {
		// 2026-11-27 is a Friday; 10:00Z = 11:00 Berlin
		const fri = new Date('2026-11-27T10:00:00Z');
		expect(p('x fri', { now: fri }).dueAt).toBe('2026-11-27T22:59:59.999Z');
		expect(p('x fri 18:00', { now: fri }).dueAt).toBe('2026-11-27T17:00:00.000Z');
		expect(p('x fri 09:00', { now: fri }).dueAt).toBe('2026-12-04T08:00:00.000Z');
	});

	it('chips carry offsets into the input, sorted', () => {
		const input = 'a !3 b #x';
		const r = p(input);
		expect(r.chips.map((c) => [c.kind, input.slice(c.start, c.end)])).toEqual([
			['priority', '!3'],
			['label', '#x']
		]);
	});

	it('keeps emoji in the title', () => {
		expect(p('Buy 🍎 #food').title).toBe('Buy 🍎');
	});

	it('reads slash dates day-first, never month-first', () => {
		expect(p('Hand in 3/4/26').dueAt).toBe('2026-04-03T21:59:59.999Z');
		expect(p('Hand in 12/25').dueAt).toBeUndefined();
		expect(p('Read page 12/13')).toMatchObject({ title: 'Read page 12/13', chips: [] });
	});

	it('due chips never overlap other chips', () => {
		const input = 'Task fri !3 23:59 #x';
		const r = p(input);
		expect(r.title).toBe('Task');
		expect(r.dueAt).toBe('2026-11-27T22:59:00.000Z');
		expect(r.chips.map((c) => [c.kind, input.slice(c.start, c.end)])).toEqual([
			['due', 'fri'],
			['priority', '!3'],
			['due', '23:59'],
			['label', '#x']
		]);
	});

	it('keeps quoted text that sits inside a date match', () => {
		expect(p('fri "x" 23:59').title).toBe('x');
	});

	it.each(['Read chapter 5', 'Buy 2 apples', 'email@x.com', 'C++ homework'])(
		'leaves %s alone',
		(input) => {
			expect(p(input)).toMatchObject({ title: input, chips: [] });
		}
	);

	it('is independent of the process timezone', () => {
		expect(p('Pay rent tomorrow').dueAt).toBe('2026-11-24T22:59:59.999Z');
		expect(p('Pay rent tomorrow', { timeZone: 'America/New_York' }).dueAt).toBe(
			'2026-11-25T04:59:59.999Z'
		);
	});
});
