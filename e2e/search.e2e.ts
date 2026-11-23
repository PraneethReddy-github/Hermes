import { expect, test, type Page } from './fixtures';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dayKey = (offset: number) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() + offset * 864e5));
// Letters only: no quick-add date parsing, and unique per run.
const uid = () =>
	[...`${Date.now()}${Math.floor(Math.random() * 1000)}`].map((c) => 'abcdefghij'[+c]).join('');

async function seed(page: Page, id: string) {
	await page.goto('/tasks');
	const quick = page.getByRole('textbox', { name: 'Quick add task' });
	await quick.fill(`Report ${id}`);
	await quick.press('Enter');
	await expect(page.getByRole('status')).toContainText('Added');

	const day = dayKey(2);
	await page.goto(`/calendar?view=agenda&date=${day}`);
	await page.getByRole('button', { name: 'New event' }).click();
	const s = page.getByRole('dialog', { name: /event/i });
	await s.getByLabel('Title').fill(`Lecture ${id}`);
	await s.getByLabel('Start date').fill(day);
	await s.getByLabel('Start time').fill('10:00');
	await s.getByLabel('End date').fill(day);
	await s.getByLabel('End time').fill('11:00');
	await s.getByRole('button', { name: 'Save' }).click();
	await expect(s).toBeHidden();

	await page.goto('/notes/new');
	await page.getByLabel('Title').fill(`Note ${id}`);
	await page.getByLabel('Body').fill(`remember ${id} for later`);
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForURL(/\/notes\/[0-9A-Z]{26}$/);
	return day;
}

test('search finds all three kinds and opens each', async ({ page }) => {
	const id = uid();
	const day = await seed(page, id);

	await page.goto('/search');
	const box = page.getByRole('searchbox', { name: 'Search' });
	await expect(box).toBeFocused();
	await box.fill(id);
	await expect(page).toHaveURL(new RegExp(`q=${id}`)); // debounced GET ?q=
	await expect(box).toBeFocused();
	for (const g of ['Tasks', 'Events', 'Notes'])
		await expect(page.getByRole('region', { name: g }).getByRole('heading')).toContainText('(1)');

	// task opens its sheet in place
	await page.getByRole('button', { name: new RegExp(`Report ${id}`) }).click();
	await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
	await page.keyboard.press('Escape');

	// event opens the agenda at its day
	await page.getByRole('link', { name: new RegExp(`Lecture ${id}`) }).click();
	await expect(page).toHaveURL(new RegExp(`/calendar\\?view=agenda&date=${day}`));

	// note opens the editor
	await page.goto(`/search?q=${id}`);
	await page.getByRole('link', { name: new RegExp(`Note ${id}`) }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9A-Z]{26}$/);
});

test('works without JS, shows recents and an empty state', async ({ page, browser }) => {
	const id = uid();
	await seed(page, id);

	const ctx = await browser.newContext({
		javaScriptEnabled: false,
		storageState: (await page.context().storageState()) as never
	});
	const bare = await ctx.newPage();
	await bare.goto(`/search?q=${id}`);
	await expect(bare.getByRole('link', { name: new RegExp(`Note ${id}`) })).toBeVisible();
	await ctx.close();

	await page.goto('/search');
	await page.getByRole('searchbox', { name: 'Search' }).fill(`zzqq${id}`);
	await expect(page.getByText(`No matches for “zzqq${id}”`)).toBeVisible();
	await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
	await page.goto('/search');
	await expect(
		page.getByRole('region', { name: 'Recent searches' }).getByRole('button', { name: `zzqq${id}` })
	).toBeVisible();

	// hostile FTS syntax degrades to an empty state, never an error page
	await page.goto(`/search?q=${encodeURIComponent('"*-(NEAR title:')}`);
	await expect(page.getByRole('searchbox', { name: 'Search' })).toBeVisible();
});
