import * as chrono from 'chrono-node';
import { TZDate } from '@date-fns/tz';
import type { Priority } from '../types';

export interface QuickAddChip {
	kind: 'priority' | 'label' | 'project' | 'due' | 'repeat' | 'estimate' | 'warning';
	text: string;
	start: number;
	end: number;
}
export interface ParsedQuickAdd {
	title: string;
	priority?: Priority;
	labels: string[];
	projectName?: string;
	dueAt?: string;
	dueHasTime?: boolean;
	rrule?: string;
	estimateMin?: number;
	chips: QuickAddChip[];
}

const W = '[\\p{L}\\p{N}_-]';
const NB = '(?<![\\p{L}\\p{N}])'; // token must not start mid-word
const FREQ: Record<string, string> = {
	day: 'DAILY',
	tag: 'DAILY',
	week: 'WEEKLY',
	woche: 'WEEKLY',
	month: 'MONTHLY',
	monat: 'MONTHLY',
	year: 'YEARLY',
	jahr: 'YEARLY'
};
// keyed by first 3 letters, en + de
const DAY_CODE: Record<string, string> = {
	mon: 'MO',
	tue: 'TU',
	wed: 'WE',
	thu: 'TH',
	fri: 'FR',
	sat: 'SA',
	sun: 'SU',
	die: 'TU',
	mit: 'WE',
	don: 'TH',
	fre: 'FR',
	sam: 'SA',
	son: 'SU'
};
const DAY_RE =
	'(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag';
const dayCode = (w: string) => DAY_CODE[w.slice(0, 3).toLowerCase()];

const NUM_DATE =
	/(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?(?!\d)|(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])/g;

export function parseQuickAdd(
	input: string,
	opts: { now: Date; timeZone: string; projectNames: string[] }
): ParsedQuickAdd {
	const { timeZone: tz } = opts;
	const out: ParsedQuickAdd = { title: '', labels: [], chips: [] };
	let masked = input; // same length as input; consumed/literal text blanked so later passes skip it
	const removed: [number, number][] = []; // ranges dropped from the title
	const held: [number, number][] = []; // quoted literal content, kept in the title
	const blank = (s: number, e: number) => {
		masked = masked.slice(0, s) + ' '.repeat(e - s) + masked.slice(e);
		removed.push([s, e]);
	};
	const chip = (kind: QuickAddChip['kind'], s: number, e: number) =>
		out.chips.push({ kind, text: input.slice(s, e), start: s, end: e });
	/** Run a regex over the masked text; blank each match; call back with it. */
	const take = (re: RegExp, fn: (m: RegExpExecArray, s: number, e: number) => boolean | void) => {
		for (const m of [...masked.matchAll(re)]) {
			const s = m.index,
				e = s + m[0].length;
			if (fn(m, s, e) !== false) blank(s, e);
		}
	};

	// quoted project first, then literal spans (quotes dropped from title, content kept)
	take(/\+"([^"]+)"/g, (m, s, e) => project(m[1], s, e));
	for (const m of [...masked.matchAll(/"([^"]*)"/g)]) {
		const s = m.index,
			e = s + m[0].length;
		removed.push([s, s + 1], [e - 1, e]);
		held.push([s + 1, e - 1]);
		masked = masked.slice(0, s) + ' '.repeat(e - s) + masked.slice(e);
	}
	take(new RegExp(`${NB}\\+(${W}+)`, 'gu'), (m, s, e) => project(m[1], s, e));
	function project(name: string, s: number, e: number) {
		const hit = opts.projectNames.find((p) => p.toLowerCase() === name.toLowerCase());
		if (hit) {
			out.projectName ??= hit;
			chip('project', s, e);
		} else chip('warning', s, e);
	}

	take(new RegExp(`${NB}!([0-4])(?![\\p{L}\\p{N}])`, 'gu'), (m, s, e) => {
		out.priority = Number(m[1]) as Priority;
		chip('priority', s, e);
	});
	take(new RegExp(`${NB}#(${W}+)`, 'gu'), (m, s, e) => {
		if (!out.labels.includes(m[1])) out.labels.push(m[1]);
		chip('label', s, e);
	});
	take(/(?<![\p{L}\p{N}])~(\d+)(m|h)(?![\p{L}\p{N}])/giu, (m, s, e) => {
		out.estimateMin = Number(m[1]) * (m[2].toLowerCase() === 'h' ? 60 : 1);
		chip('estimate', s, e);
	});

	// repeat
	const unit = Object.keys(FREQ).join('|');
	take(
		new RegExp(
			`${NB}(?:every|jeden|jede|jedes)\\s+(?:(\\d+)\\s*(${unit})\\w*|(${unit})\\b|(${DAY_RE})\\b)`,
			'giu'
		),
		(m, s, e) => {
			const key = (m[2] ?? m[3])?.toLowerCase();
			if (key) {
				out.rrule = `FREQ=${FREQ[key]}` + (m[1] && m[1] !== '1' ? `;INTERVAL=${m[1]}` : '');
			} else out.rrule = `FREQ=WEEKLY;BYDAY=${dayCode(m[4])}`;
			chip('repeat', s, e);
		}
	);

	// due: numeric day-first date, else chrono (en + de, longest match wins)
	let ymd: [number, number, number] | undefined; // y, m(1-12), d
	const wall = new TZDate(opts.now, tz);
	const ref = new Date(
		wall.getFullYear(),
		wall.getMonth(),
		wall.getDate(),
		wall.getHours(),
		wall.getMinutes()
	);
	// Every dd.mm. / dd/mm match is shielded from chrono (which reads slashes month-first);
	// only the first valid day-first one becomes the date.
	for (const m of [...masked.matchAll(NUM_DATE)]) {
		const d = Number(m[1] ?? m[4]),
			mo = Number(m[2] ?? m[5]);
		let y = Number(m[3] ?? m[6] ?? 0);
		if (y && y < 100) y += 2000;
		if (!y) {
			y = wall.getFullYear();
			const today = Date.UTC(y, wall.getMonth(), wall.getDate());
			if (Date.UTC(y, mo - 1, d) < today) y++;
		}
		const s = m.index,
			e = s + m[0].length;
		const ok = mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
		if (ok && !ymd) {
			ymd = [y, mo, d];
			chip('due', s, e);
			blank(s, e);
		} else masked = masked.slice(0, s) + ' '.repeat(e - s) + masked.slice(e);
	}
	const best = [chrono.en.casual, chrono.de.casual]
		.flatMap((c) => c.parse(masked, ref, { forwardDate: true }))
		.filter((r) => !ymd || r.start.isCertain('hour')) // with a numeric date only a time is wanted
		.sort((a, b) => b.text.length - a.text.length)[0];
	if (ymd || best) {
		const hasTime = !!best?.start.isCertain('hour');
		const [y, mo, d] = ymd ?? [
			best.start.get('year')!,
			best.start.get('month')!,
			best.start.get('day')!
		];
		const [h, mi, s, ms] = hasTime
			? [best.start.get('hour')!, best.start.get('minute') ?? 0, 0, 0]
			: [23, 59, 59, 999];
		out.dueAt = new Date(new TZDate(y, mo - 1, d, h, mi, s, ms, tz).getTime()).toISOString();
		out.dueHasTime = hasTime;
		if (best) {
			// the match may span tokens consumed earlier or quoted text: take only the pieces between them
			const taken = new Set(
				[...removed, ...held].flatMap(([s, e]) => Array.from({ length: e - s }, (_, i) => s + i))
			);
			const end = best.index + best.text.length;
			let i = best.index;
			while (i < end) {
				if (taken.has(i)) {
					i++;
					continue;
				}
				let j = i;
				while (j < end && !taken.has(j)) j++;
				const lead = input.slice(i, j).search(/\S/);
				if (lead >= 0) {
					const text = input.slice(i + lead, j).trimEnd();
					chip('due', i + lead, i + lead + text.length);
					removed.push([i, j]);
				}
				i = j;
			}
		}
	}

	const drop = new Set(removed.flatMap(([s, e]) => Array.from({ length: e - s }, (_, i) => s + i)));
	out.title = input
		.split('')
		.filter((_, i) => !drop.has(i))
		.join('')
		.replace(/\s+/g, ' ')
		.trim();
	out.chips.sort((a, b) => a.start - b.start);
	return out;
}
