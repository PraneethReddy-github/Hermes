import { expect, test, type Locator, type Page } from './fixtures';

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
// Setup stores the browser's timezone for the user, and the Node process shares it.
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dayKey = (offset: number) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() + offset * 864e5));
// Letters only, so the quick-add parser never reads the title as a date.
const uid = () =>
	[...`${Date.now()}${Math.floor(Math.random() * 1000)}`].map((c) => 'abcdefghij'[+c]).join('');

const quick = (page: Page) => page.getByRole('textbox', { name: 'Quick add task' });
const row = (scope: Page | Locator, title: string) =>
	scope.getByRole('listitem').filter({ hasText: title });

async function add(page: Page, text: string) {
	await page.goto('/tasks');
	await quick(page).fill(text);
	await quick(page).press('Enter');
	await expect(page.getByRole('status')).toContainText('Added');
}

/** Real touch swipe through CDP: pointer events with pointerType 'touch'. */
async function swipe(page: Page, target: Locator, dx: number) {
	const box = (await target.boundingBox())!;
	const y = box.y + box.height / 2;
	const x0 = box.x + box.width / 2;
	const cdp = await page.context().newCDPSession(page);
	const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
		cdp.send('Input.dispatchTouchEvent', {
			type,
			touchPoints: x === undefined ? [] : [{ x, y }]
		});
	await touch('touchStart', x0);
	for (let i = 1; i <= 8; i++) await touch('touchMove', x0 + (dx * i) / 8);
	await touch('touchEnd');
}

async function complete(page: Page, title: string) {
	const r = row(page, title);
	if (isDesktop(page)) await r.getByRole('button', { name: `Complete ${title}` }).click();
	else await swipe(page, r, 160);
}

test('quick-add shows chips and creates task in Uni', async ({ page }) => {
	const t = `SCAD ${uid()}`;
	await page.goto('/tasks');
	await quick(page).fill(`${t} +Uni !3 tomorrow`);
	const chips = page.getByRole('list', { name: 'Parsed tokens' });
	for (const c of ['+Uni', '!3', 'tomorrow'])
		await expect(chips.getByText(c, { exact: true })).toBeVisible();
	await quick(page).press('Enter');
	await expect(quick(page)).toHaveValue('');
	await expect(quick(page)).toBeFocused();
	await expect(page.getByRole('status')).toContainText('Added');

	await page.goto('/tasks/upcoming');
	const tomorrow = row(page.getByRole('region', { name: 'Tomorrow' }), t);
	await expect(tomorrow).toBeVisible();
	await expect(tomorrow.getByRole('img', { name: 'High priority' })).toBeVisible();

	await page.goto('/tasks/projects');
	await page.getByRole('link', { name: 'Uni' }).click();
	await expect(row(page, t)).toBeVisible();
});

test('swipe right / checkbox completes task, Completed shows it with Undo', async ({ page }) => {
	const t = `Pay ${uid()}`;
	await add(page, `${t} today`);
	await expect(row(page, t)).toBeVisible();
	await complete(page, t);
	await expect(row(page, t)).toBeHidden();
	await expect(page.getByRole('status')).toContainText('Completed');

	await page.goto('/tasks/completed');
	const done = row(page, t);
	await expect(done).toBeVisible();
	await done.getByRole('button', { name: 'Undo' }).click();
	await expect(done).toBeHidden();
	await page.goto('/tasks');
	await expect(row(page, t)).toBeVisible();
});

test('toast Undo brings the completed task back', async ({ page }) => {
	const t = `Toast ${uid()}`;
	await add(page, `${t} today`);
	await complete(page, t);
	await expect(row(page, t)).toBeHidden();
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(row(page, t)).toBeVisible();
});

test('toast Undo on a repeating task restores its due date', async ({ page }) => {
	const t = `Weekly ${uid()}`;
	await add(page, `${t} today every week`);
	await complete(page, t);
	await expect(page.getByRole('status')).toContainText('Completed');
	await expect(row(page, t)).toBeHidden(); // advanced a week, so out of Today
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(row(page, t)).toBeVisible();
	await expect(row(page, t)).toContainText('today');
});

test('focus moves to a neighbouring row when a row completes', async ({ page }) => {
	test.skip(!isDesktop(page), 'keyboard focus');
	// Own project and tasks: other workers' tasks on the shared Today list come and go.
	const t = `Focus ${uid()}`;
	const proj = `P${uid()}`;
	await page.goto('/projects');
	const form = page.locator('form', { hasText: 'New project' });
	await form.getByLabel('Name').fill(proj);
	await form.getByRole('button', { name: 'Add project' }).click();
	await page.getByRole('link', { name: proj }).click();
	await expect(page).toHaveURL(/\/projects\/./);
	const project = page.url();
	await add(page, `${t}a today +${proj}`);
	await add(page, `${t}b today +${proj}`);
	await page.goto(project);
	await expect(row(page, `${t}a`)).toBeVisible();
	await expect(row(page, `${t}b`)).toBeVisible();
	await complete(page, `${t}a`);
	await expect(row(page, `${t}a`)).toBeHidden();
	await expect(row(page, `${t}b`).locator('[data-focus]')).toBeFocused();
});

test('swipe left (or the clock button) → Tomorrow reschedules', async ({ page }) => {
	const t = `Move ${uid()}`;
	await add(page, `${t} today`);
	const r = row(page, t);
	if (isDesktop(page)) await r.getByRole('button', { name: `Reschedule ${t}` }).click();
	else await swipe(page, r, -160);
	await page
		.getByRole('dialog', { name: 'Reschedule' })
		.getByRole('button', { name: 'Tomorrow' })
		.click();
	await expect(r).toBeHidden();
	await page.goto('/tasks/upcoming');
	await expect(row(page.getByRole('region', { name: 'Tomorrow' }), t)).toBeVisible();
});

test('a short swipe does nothing', async ({ page }) => {
	test.skip(isDesktop(page), 'touch only');
	const t = `Stay ${uid()}`;
	await add(page, `${t} today`);
	await swipe(page, row(page, t), 40);
	await expect(row(page, t)).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('token-only quick-add shows "Add a title" and creates nothing', async ({ page }) => {
	await page.goto('/tasks/projects');
	await page.getByRole('link', { name: 'Personal' }).click();
	const items = page.getByRole('list', { name: 'Tasks' }).getByRole('listitem');
	const before = await items.count();
	await quick(page).fill('+Personal !3 tomorrow');
	await quick(page).press('Enter');
	await expect(page.getByRole('alert')).toHaveText('Add a title');
	await expect(quick(page)).toHaveValue('+Personal !3 tomorrow');
	await page.reload();
	await expect(items).toHaveCount(before);
});

test('edit sheet saves due date/time in the user timezone, repeat and subtasks', async ({
	page
}) => {
	const t = `Edit ${uid()}`;
	await add(page, `${t} today`);
	await row(page, t).getByRole('button', { name: t, exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Edit task' });
	await sheet.getByLabel('Title').fill(`${t} x`);
	await sheet.getByLabel('Due date').fill(dayKey(1));
	await sheet.getByLabel('Due time').fill('09:30');
	await sheet.getByLabel('Priority').selectOption({ label: 'High' });
	await sheet.getByLabel('Repeat').selectOption({ label: 'Weekly' });
	await sheet.getByLabel('Add subtask').fill('Sub one');
	await sheet.getByLabel('Add subtask').press('Enter');
	await expect(sheet.getByRole('list', { name: 'Subtasks' })).toContainText('Sub one');
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet).toBeHidden();

	await page.goto('/tasks/upcoming');
	const r = row(page.getByRole('region', { name: 'Tomorrow' }), `${t} x`);
	await expect(r).toContainText('tomorrow 09:30');
	await expect(r.getByRole('img', { name: 'High priority' })).toBeVisible();
	await r.getByRole('button', { name: `${t} x`, exact: true }).click();
	await expect(sheet.getByLabel('Due time')).toHaveValue('09:30');
	await expect(sheet.getByLabel('Repeat')).toHaveValue('FREQ=WEEKLY');
});
