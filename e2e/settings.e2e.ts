import { expect, test, type Page } from './fixtures';

// These tests change the single shared user's settings, so they run in their own project after
// everything else (playwright.config.ts) and each restores what it touched.

const label = (tz: string) =>
	new Intl.DateTimeFormat('en-GB', {
		timeZone: tz,
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	})
		.format(new Date())
		.replace(/^(\w+) /, '$1, ');
const dayOf = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

async function saveTime(page: Page, timezone: string, weekStart?: string) {
	await page.goto('/settings');
	await page.getByLabel('Timezone').selectOption(timezone);
	if (weekStart) await page.getByLabel('Week starts on').selectOption(weekStart);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('Saved');
}

test('changing timezone changes the Today date label near midnight', async ({ page }) => {
	await page.goto('/settings');
	const original = await page.getByLabel('Timezone').inputValue();
	// The server renders Today from its own clock, which page.clock cannot move. Berlin is UTC+1 in
	// winter, so Kiritimati (+14) or Pago Pago (-11) is always on a different calendar day than Berlin.
	const other = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'].find(
		(z) => dayOf(z) !== dayOf('Europe/Berlin')
	)!;
	try {
		await saveTime(page, 'Europe/Berlin');
		await page.goto('/');
		await expect(page.locator('.date')).toHaveText(label('Europe/Berlin'));
		await saveTime(page, other);
		await page.goto('/');
		await expect(page.locator('.date')).toHaveText(label(other));
		expect(label(other)).not.toBe(label('Europe/Berlin'));
	} finally {
		await saveTime(page, original);
	}
});

test('week start Sunday is saved and restored', async ({ page }) => {
	await page.goto('/settings');
	const [tz, ws] = [
		await page.getByLabel('Timezone').inputValue(),
		await page.getByLabel('Week starts on').inputValue()
	];
	try {
		await saveTime(page, tz, '0');
		await page.reload();
		await expect(page.getByLabel('Week starts on')).toHaveValue('0');
	} finally {
		await saveTime(page, tz, ws);
	}
});

test('Back up now shows a new timestamp', async ({ page }) => {
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Back up now' }).click();
	await expect(page.getByRole('status')).toContainText('Backup complete');
	await expect(page.getByRole('alert')).toHaveCount(0);
	const file = await page.getByText(/hermes-\d{8}-\d{4}\.db/).textContent();
	const [, y, mo, d, h, mi] = /hermes-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(file!)!;
	const age = Date.now() - Date.UTC(+y, +mo - 1, +d, +h, +mi);
	expect(age).toBeGreaterThanOrEqual(-60_000);
	expect(age).toBeLessThan(3 * 60_000);
	// a second click within 30 s is refused, inline, without crashing
	await page.getByRole('button', { name: 'Back up now' }).click();
	await expect(page.getByRole('alert')).toContainText('Try again');
});

test('theme light sets data-theme=light and survives reload', async ({ page }) => {
	await page.goto('/settings');
	const html = page.locator('html');
	const was = await page.getByRole('button', { pressed: true }).first().textContent();
	try {
		await page.getByRole('button', { name: 'Light' }).click();
		await expect(html).toHaveAttribute('data-theme', 'light');
		await expect(page.getByRole('status')).toContainText('Saved');
		await page.reload(); // server-rendered, no flash
		await expect(html).toHaveAttribute('data-theme', 'light');
		await expect(page.getByRole('button', { name: 'Light' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	} finally {
		await page.getByRole('button', { name: was!.trim() }).click();
		await expect(html).toHaveAttribute('data-theme', was!.trim().toLowerCase());
	}
});

test('settings rows are at least 44px tall and the version shows', async ({ page }) => {
	await page.goto('/settings');
	for (const name of ['Projects', 'Labels', 'Import calendar', 'Security']) {
		const box = await page.getByRole('link', { name }).boundingBox();
		expect(box!.height).toBeGreaterThanOrEqual(44);
	}
	await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
	await expect(page.getByText(/^Hermes \d+\.\d+\.\d+/)).toBeVisible();
});
