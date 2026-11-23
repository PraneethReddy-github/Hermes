import { expect, test, type Page } from './fixtures';

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
// Setup stores the browser's timezone for the user, and the Node process shares it.
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dayKey = (offset: number) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() + offset * 864e5));
// Letters only, so the quick-add parser never reads the title as a date.
const uid = () =>
	[...`${Date.now()}${Math.floor(Math.random() * 1000)}`].map((c) => 'abcdefghij'[+c]).join('');

const sheet = (page: Page) => page.getByRole('dialog', { name: /event/i });

async function addEvent(page: Page, title: string, day: string, opts: { repeat?: string } = {}) {
	await page.goto(`/calendar?view=agenda&date=${day}`);
	await page.getByRole('button', { name: 'New event' }).click();
	const s = sheet(page);
	await s.getByLabel('Title').fill(title);
	await s.getByLabel('Start date').fill(day);
	await s.getByLabel('Start time').fill('10:00');
	await s.getByLabel('End date').fill(day);
	await s.getByLabel('End time').fill('11:00');
	if (opts.repeat) await s.getByLabel('Repeat').selectOption(opts.repeat);
	await s.getByRole('button', { name: 'Save' }).click();
	await expect(s).toBeHidden();
}

test('create event in agenda and see it on that day', async ({ page }) => {
	const title = `Lecture ${uid()}`;
	const day = dayKey(2);
	await addEvent(page, title, day);
	const section = page.locator(`section[data-day="${day}"]`);
	await expect(section.getByRole('button', { name: `${title}, 10:00–11:00` })).toBeVisible();
});

test('all-day toggle hides the time inputs', async ({ page }) => {
	await page.goto('/calendar?view=agenda');
	await page.getByRole('button', { name: 'New event' }).click();
	const s = sheet(page);
	await expect(s.getByLabel('Start time')).toBeVisible();
	await s.getByLabel('All day').check();
	await expect(s.getByLabel('Start time')).toBeHidden();
	await expect(s.getByLabel('End time')).toBeHidden();
});

test('task due tomorrow shows as outlined chip in day view', async ({ page }) => {
	const title = `Report ${uid()}`;
	await page.goto('/tasks');
	const quick = page.getByRole('textbox', { name: 'Quick add task' });
	await quick.fill(`${title} tomorrow`);
	await quick.press('Enter');
	await expect(page.getByRole('status')).toContainText('Added');

	await page.goto(`/calendar?view=day&date=${dayKey(1)}`);
	const chip = page.getByRole('button', { name: `${title}, task` });
	await expect(chip).toBeVisible();
	await expect(chip).toHaveAttribute('data-kind', 'task');
	await expect(chip).toHaveCSS('border-top-style', 'solid');
	await chip.click();
	await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
});

test('delete one occurrence of weekly event leaves others', async ({ page }) => {
	const title = `Weekly ${uid()}`;
	await addEvent(page, title, dayKey(1), { repeat: 'FREQ=WEEKLY' });
	await page.goto(`/calendar?view=agenda&date=${dayKey(1)}&days=28`);
	const on = (offset: number) =>
		page
			.locator(`section[data-day="${dayKey(offset)}"]`)
			.getByRole('button', { name: new RegExp(title) });
	for (const o of [1, 8, 15]) await expect(on(o)).toBeVisible();

	await on(8).click();
	await page
		.getByRole('dialog', { name: 'Edit recurring event' })
		.getByRole('button', { name: 'This event' })
		.click();
	await sheet(page).getByRole('button', { name: 'Delete' }).click();
	await expect(on(8)).toBeHidden();
	await expect(on(1)).toBeVisible();
	await expect(on(15)).toBeVisible();
});

test('month view dot → agenda at day', async ({ page }) => {
	const title = `Month ${uid()}`;
	const day = dayKey(3);
	await addEvent(page, title, day);
	await page.goto(`/calendar?view=month&date=${day}`);
	const cell = page.locator(`a[data-day="${day}"]`);
	await expect(cell.locator('.dot.event').first()).toBeVisible();
	await cell.click();
	await expect(page).toHaveURL(new RegExp(`view=agenda&date=${day}`));
	await expect(
		page.locator(`section[data-day="${day}"]`).getByRole('button', { name: new RegExp(title) })
	).toBeVisible();
});

test('week view: switcher, today column and drag to move (desktop)', async ({ page }) => {
	test.skip(!isDesktop(page), 'drag is pointer: fine only');
	const title = `Drag ${uid()}`;
	const day = dayKey(0);
	await addEvent(page, title, day);
	await page.goto(`/calendar?view=week&date=${day}`);
	await expect(page.getByRole('radio', { name: 'Week' })).toBeChecked();
	await expect(page.locator('.now')).toBeVisible();

	const block = page.getByRole('button', { name: `${title}, 10:00–11:00` });
	// Deterministic: 10:00 sits well below the sticky header whatever the time of day.
	await page.locator('.scroller').evaluate((e, y) => (e.scrollTop = y), 8 * 56);
	const box = (await block.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + 10);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + 10 + 56 * 2, { steps: 8 });
	await page.mouse.up();
	await expect(page.getByRole('button', { name: `${title}, 12:00–13:00` })).toBeVisible();
});

test('deleting a single event asks first', async ({ page }) => {
	const title = `Gone ${uid()}`;
	const day = dayKey(4);
	await addEvent(page, title, day);
	const ev = page
		.locator(`section[data-day="${day}"]`)
		.getByRole('button', { name: new RegExp(title) });
	await ev.click();
	await page
		.getByRole('dialog', { name: 'Edit event' })
		.getByRole('button', { name: 'Delete' })
		.click();
	const confirm = page.getByRole('dialog', { name: 'Delete event?' });
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(confirm).toBeHidden();
	await page
		.getByRole('dialog', { name: 'Edit event' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await confirm.getByRole('button', { name: 'Delete' }).click();
	await expect(ev).toBeHidden();
});

test('bad date params fall back to today instead of failing', async ({ page }) => {
	for (const d of ['2026-13-45', '0000-00-00', '9999-12-31'])
		for (const v of ['agenda', 'month', 'week'])
			expect((await page.goto(`/calendar?view=${v}&date=${d}`))!.status()).toBe(200);
});

test('agenda rows are at least 44px tall', async ({ page }) => {
	const title = `Tall ${uid()}`;
	const day = dayKey(5);
	await addEvent(page, title, day);
	const box = await page
		.locator(`section[data-day="${day}"]`)
		.getByRole('button', { name: new RegExp(title) })
		.boundingBox();
	expect(box!.height).toBeGreaterThanOrEqual(44);
});
