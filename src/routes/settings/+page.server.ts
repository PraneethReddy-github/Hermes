import { fail } from '@sveltejs/kit';
import { getDb } from '../../lib/server/db';
import { backupDir, countBackups, lastBackup, runBackup } from '../../lib/server/backup';
import { field } from '../../lib/server/form';
import { getUserSettings, updateUserSettings } from '../../lib/server/services/settings';
import { THEMES } from '../../lib/theme';
import { TIMEZONES } from '../../lib/timezones';
import type { Actions, PageServerLoad } from './$types';

const BACKUP_COOLDOWN_MS = 30_000;
// shortcut: per process, resets on restart; enough to stop a hammered disk for a single user
let lastBackupRun = 0;

export const load: PageServerLoad = ({ locals }) => {
	const s = getUserSettings(getDb());
	const dir = backupDir();
	const last = lastBackup(dir);
	return {
		theme: locals.theme,
		timezone: s.timezone,
		weekStart: s.weekStart,
		timezones: TIMEZONES,
		backup: {
			count: countBackups(dir),
			last: last && {
				file: last.file,
				at: new Intl.DateTimeFormat('en-GB', {
					timeZone: s.timezone,
					dateStyle: 'medium',
					timeStyle: 'short'
				}).format(last.at)
			}
		}
	};
};

export const actions: Actions = {
	theme: async ({ request }) => {
		const theme = field(await request.formData(), 'theme');
		if (!(THEMES as readonly string[]).includes(theme))
			return fail(400, { error: 'Invalid theme' });
		updateUserSettings(getDb(), { theme: theme as (typeof THEMES)[number] });
	},

	time: async ({ request }) => {
		const f = await request.formData();
		const timezone = field(f, 'timezone');
		const weekStart = field(f, 'weekStart');
		if (!TIMEZONES.includes(timezone)) return fail(400, { error: 'Choose a valid timezone' });
		if (weekStart !== '0' && weekStart !== '1')
			return fail(400, { error: 'Choose Monday or Sunday as the week start' });
		updateUserSettings(getDb(), { timezone, weekStart: weekStart === '1' ? 1 : 0 });
	},

	backup: async () => {
		const wait = lastBackupRun + BACKUP_COOLDOWN_MS - Date.now();
		if (wait > 0)
			return fail(429, {
				backupError: `A backup just ran. Try again in ${Math.ceil(wait / 1000)} s.`
			});
		lastBackupRun = Date.now();
		try {
			await runBackup(getDb(), backupDir(), new Date());
		} catch (e) {
			lastBackupRun = 0;
			console.error('[hermes] manual backup failed', e);
			return fail(500, { backupError: 'Backup failed. Check the server log.' });
		}
	}
};
