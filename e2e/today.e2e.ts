import { expect, test, type Page } from './fixtures';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dayKey = (offset: number) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() + offset * 864e5));
// Letters only, so the quick-add parser never reads the title as a date.
const uid = () =>
	[...`${Date.now()}${Math.floor(Math.random() * 1000)}`].map((c) => 'abcdefghij'[+c]).join('');

async function quickAdd(page: Page, text: string) {
	await page.goto('/tasks');
	const quick = page.getByRole('textbox', { name: 'Quick add task' });
	await quick.fill(text);
	await quick.press('Enter');
	await expect(page.getByRole('status')).toContainText('Added');
}

async function addEvent(page: Page, title: string, day: string) {
	await page.goto(`/calendar?view=agenda&date=${day}`);
	await page.getByRole('button', { name: 'New event' }).click();
	const s = page.getByRole('dialog', { name: /event/i });
	await s.getByLabel('Title').fill(title);
	await s.getByLabel('Start date').fill(day);
	await s.getByLabel('Start time').fill('10:00');
	await s.getByLabel('End date').fill(day);
	await s.getByLabel('End time').fill('11:00');
	await s.getByRole('button', { name: 'Save' }).click();
	await expect(s).toBeHidden();
}

test('Today shows events, overdue first in red, due soon, and Shopping count', async ({ page }) => {
	const id = uid();
	const [event, late, soon, shop] = [`Lecture ${id}`, `Late ${id}`, `Soon ${id}`, `Eggs ${id}`];
	await addEvent(page, event, dayKey(0));
	await quickAdd(page, `${late} yesterday`);
	await quickAdd(page, `${soon} !3 in 2 days`);
	await quickAdd(page, `${shop} +Shopping`);

	await page.goto('/');
	await expect(page.getByRole('link', { name: event })).toContainText('10:00');
	await expect(page.getByRole('link', { name: event })).toHaveAttribute(
		'href',
		`/calendar?view=day&date=${dayKey(0)}`
	);

	const overdue = page.getByRole('heading', { name: /^Overdue/ });
	await expect(overdue).toHaveCSS('color', /^rgb\((224, 82, 82|184, 50, 50)\)$/); // --danger, either theme
	await expect(page.getByRole('listitem').filter({ hasText: late })).toBeVisible();
	const soonSection = page.locator('section', {
		has: page.getByRole('heading', { name: /^Due soon/ })
	});
	await expect(soonSection.getByText(soon)).toBeVisible();
	// Overdue precedes Due soon in the page.
	const [a, b] = await Promise.all([overdue.boundingBox(), soonSection.boundingBox()]);
	expect(a!.y).toBeLessThan(b!.y);

	await expect(page.getByRole('link', { name: /^Shopping \d+$/ })).toBeVisible();

	// Desktop: today's day view sits beside the sections, with its now-line.
	const wide = (page.viewportSize()?.width ?? 0) >= 1024;
	await expect(page.locator('.now')).toHaveCount(wide ? 1 : 0);
	if (wide) await expect(page.getByRole('button', { name: `${event}, 10:00–11:00` })).toBeVisible();
});

test('completing an overdue task removes the row', async ({ page }) => {
	const title = `Done ${uid()}`;
	await quickAdd(page, `${title} yesterday`);
	await page.goto('/');
	const row = page.getByRole('listitem').filter({ hasText: title });
	await row.getByRole('button', { name: `Complete ${title}` }).click();
	await expect(row).toBeHidden();
	await page.reload();
	await expect(row).toBeHidden();
});

test('refetches when the app wakes after more than 5 minutes', async ({ page }) => {
	await page.clock.install({ time: new Date() });
	await page.goto('/');
	await expect(page.locator('.date')).toBeVisible();
	const reload = page.waitForRequest(/__data\.json/);
	await page.clock.fastForward('06:00');
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await reload;
});

test('a timed task earlier today is Overdue; a date-only one today is Due today', async ({
	page
}) => {
	const [timed, dateOnly] = [`Timed ${uid()}`, `Dated ${uid()}`];
	await quickAdd(page, `${timed} today at 00:01`);
	await quickAdd(page, `${dateOnly} today`);
	await page.goto('/');
	const section = (name: RegExp) =>
		page.locator('section', { has: page.getByRole('heading', { name }) });
	await expect(section(/^Overdue/).getByText(timed)).toBeVisible();
	await expect(section(/^Due today/).getByText(dateOnly)).toBeVisible();
	await expect(section(/^Due today/).getByText(timed)).toBeHidden();
});
