import rrulePkg from 'rrule'; // CJS package: named import fails in plain Node ESM
import { TZDate } from '@date-fns/tz';

const { RRule } = rrulePkg;

// shortcut: sub-daily FREQ (HOURLY/MINUTELY/SECONDLY) is unsupported by the floating-time approach; callers must reject it.
// rrule mishandles TZID, so it runs on "floating" dates: the local wall-clock in `tz` stored as UTC fields.
// This keeps "every Monday 09:00" at 09:00 local across DST.
const toFloating = (iso: string | Date, tz: string) => {
	const t = new TZDate(new Date(iso).getTime(), tz);
	return new Date(
		Date.UTC(
			t.getFullYear(),
			t.getMonth(),
			t.getDate(),
			t.getHours(),
			t.getMinutes(),
			t.getSeconds(),
			t.getMilliseconds()
		)
	);
};
const fromFloating = (f: Date, tz: string) =>
	new Date(
		new TZDate(
			f.getUTCFullYear(),
			f.getUTCMonth(),
			f.getUTCDate(),
			f.getUTCHours(),
			f.getUTCMinutes(),
			f.getUTCSeconds(),
			f.getUTCMilliseconds(),
			tz
		).getTime()
	);

function makeRule(rrule: string, dtstart: string, tz: string) {
	const opts = RRule.parseString(rrule);
	if (opts.until)
		// UNTIL is real UTC; the rule runs floating. A date-only UNTIL (UTC midnight) means through that local day.
		opts.until = /UNTIL=\d{8}(?![\dT])/i.test(rrule)
			? new Date(opts.until.getTime() + DAY - 1)
			: toFloating(opts.until, tz);
	return new RRule({ ...opts, dtstart: toFloating(dtstart, tz) });
}

// rrule scans period by period even when nothing matches, so a rule that never matches runs to year 9999
// (about 10 s for DAILY). It re-reads `interval` once or twice per step, and interval 0 ends the scan, so
// count the reads and return 0 when the budget is spent: results are cut short instead of hanging.
const MAX_STEP_READS = 300_000;
/** Each call of `run` gets a fresh budget (`maxReads` overrides the default). */
function budgeted<T>(rule: InstanceType<typeof RRule>, run: () => T, maxReads = MAX_STEP_READS): T {
	const opts = rule.options;
	const interval = opts.interval;
	let reads = 0;
	Object.defineProperty(opts, 'interval', {
		configurable: true,
		get: () => (++reads > maxReads ? 0 : interval)
	});
	return run();
}

const DAY = 86400000;

/** First occurrence strictly after `after`, or null. */
export function nextOccurrenceAfter(
	rrule: string,
	dtstart: string,
	after: string,
	tz: string
): string | null {
	const rule = makeRule(rrule, dtstart, tz);
	const limit = new Date(after).getTime();
	// start a day early so the floating/real offset (DST) can never skip a candidate
	let cur = new Date(toFloating(after, tz).getTime() - DAY);
	for (;;) {
		const n = budgeted(rule, () => rule.after(cur, false));
		if (!n) return null;
		const real = fromFloating(n, tz);
		if (real.getTime() > limit) return real.toISOString();
		cur = n;
	}
}

/** Occurrences in [rangeStart, rangeEnd). */
export function expandOccurrences(
	rrule: string,
	dtstart: string,
	rangeStart: string,
	rangeEnd: string,
	tz: string,
	maxReads?: number
): string[] {
	const rule = makeRule(rrule, dtstart, tz);
	const [s, e] = [new Date(rangeStart).getTime(), new Date(rangeEnd).getTime()];
	// widen by a day each side, then filter on real instants
	return budgeted(
		rule,
		() =>
			rule.between(
				new Date(toFloating(rangeStart, tz).getTime() - DAY),
				new Date(toFloating(rangeEnd, tz).getTime() + DAY),
				true
			),
		maxReads
	)
		.map((f) => fromFloating(f, tz))
		.filter((d) => d.getTime() >= s && d.getTime() < e)
		.map((d) => d.toISOString());
}

/** Set UNTIL one second before `untilExclusive` (for "this and following"); drops COUNT, which conflicts with UNTIL. */
export function splitRruleUntil(rrule: string, untilExclusive: string): string {
	const until = new Date(new Date(untilExclusive).getTime() - 1000)
		.toISOString()
		.replace(/[-:]|\.\d{3}/g, '');
	const parts = rrule.split(';').filter((p) => p && !/^(UNTIL|COUNT)=/i.test(p));
	return [...parts, `UNTIL=${until}`].join(';');
}
