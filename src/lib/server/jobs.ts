import { asc } from 'drizzle-orm';
import type { Db } from './db';
import { users } from './db/schema';
import { backupDir, lastBackup, runBackup } from './backup';

const DAY = 24 * 3600_000;

// Local date and minutes-since-midnight in the user's timezone.
function local(now: Date, tz: string) {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-GB', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(now)
			.map((x) => [x.type, x.value])
	);
	return { day: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}

/** Nightly backup at 03:30 user-local, plus one at startup if none in the last 24 h. */
export function startJobs(db: Db): void {
	if (process.env.VITEST || process.env.HERMES_E2E === '1') return;
	const dir = backupDir();
	const tz = () =>
		db.select({ tz: users.timezone }).from(users).orderBy(asc(users.createdAt)).limit(1).get()
			?.tz ?? 'Europe/Berlin';
	const backup = (now: Date) =>
		runBackup(db, dir, now).catch((e) => console.error('[hermes] backup failed', e));

	let ranDay = '';
	try {
		const last = lastBackup(dir);
		ranDay = last ? local(last.at, tz()).day : '';
		if (!last || Date.now() - last.at.getTime() > DAY) {
			ranDay = local(new Date(), tz()).day;
			void backup(new Date());
		}
	} catch (e) {
		console.error('[hermes] backup init failed', e);
	}
	setInterval(() => {
		try {
			const now = new Date();
			const l = local(now, tz());
			if (l.minutes >= 3 * 60 + 30 && l.day !== ranDay) {
				ranDay = l.day;
				void backup(now);
			}
		} catch (e) {
			console.error('[hermes] backup tick failed', e);
		}
	}, 60_000).unref();
}
