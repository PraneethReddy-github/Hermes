import { expect, test } from './fixtures';

// Letters only; unique per run because the e2e database persists UIDs.
const uid = () =>
	[...`${Date.now()}${Math.floor(Math.random() * 1000)}`].map((c) => 'abcdefghij'[+c]).join('');
const makeIcs = (id: string) =>
	[
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//e2e//EN',
		'BEGIN:VEVENT',
		`UID:${id}@e2e`,
		'DTSTAMP:20260901T000000Z',
		'DTSTART:20990105T090000Z',
		'DTEND:20990105T100000Z',
		`SUMMARY:Import ${id}`,
		'END:VEVENT',
		'END:VCALENDAR'
	].join('\r\n');

test('import an .ics file, then skip it as a duplicate', async ({ page }) => {
	const id = uid();
	const ics = makeIcs(id);
	await page.goto('/settings');
	await page.getByRole('link', { name: 'Import calendar' }).click();
	const upload = async (name: string, buffer: Buffer) => {
		await page
			.getByLabel(/Calendar file/)
			.setInputFiles({ name, mimeType: 'text/calendar', buffer });
		await page.getByRole('button', { name: 'Import' }).click();
	};
	await upload('cal.ics', Buffer.from(ics));
	await expect(page.locator('p[role=status]')).toHaveText(/Imported 1 event, skipped 0/);
	await upload('cal.ics', Buffer.from(ics));
	await expect(page.locator('p[role=status]')).toHaveText(/Imported 0 events, skipped 1/);
	await page.goto('/calendar?view=agenda&date=2099-01-05');
	await expect(page.getByRole('button', { name: new RegExp(`Import ${id}`) })).toBeVisible();
});

test('a broken file shows an error', async ({ page }) => {
	await page.goto('/settings/import');
	await page
		.getByLabel(/Calendar file/)
		.setInputFiles({ name: 'bad.ics', mimeType: 'text/calendar', buffer: Buffer.from('nope') });
	await page.getByRole('button', { name: 'Import' }).click();
	await expect(page.getByRole('alert')).toHaveText('Could not read this calendar file');
});
