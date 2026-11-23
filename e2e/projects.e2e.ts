import { expect, test, type Page } from './fixtures';

// Letters only, so the quick-add parser never reads a name as a date.
const uid = () =>
	[...`${Date.now()}${Math.floor(Math.random() * 1000)}`].map((c) => 'abcdefghij'[+c]).join('');

async function createProject(page: Page, name: string, kind: 'list' | 'checklist' = 'list') {
	await page.goto('/projects');
	const form = page.locator('form', { hasText: 'New project' });
	await form.getByLabel('Name').fill(name);
	await form.getByLabel('Blue').check();
	await form.getByLabel('Kind').selectOption(kind);
	await form.getByRole('button', { name: 'Add project' }).click();
	await expect(page.getByRole('list', { name: 'Projects' }).getByText(name)).toBeVisible();
}

test('create project and see it in quick-add autocomplete', async ({ page }) => {
	const name = `Proj${uid()}`;
	await createProject(page, name);
	const item = page.getByRole('listitem').filter({ hasText: name });
	await expect(item.getByLabel('0 open')).toBeVisible();

	// Names are unique, ignoring case.
	await page.getByLabel('Name').fill(name.toLowerCase());
	await page.getByRole('button', { name: 'Add project' }).click();
	await expect(page.getByRole('alert')).toHaveText('A project with that name exists');

	await page.goto('/tasks');
	await page.getByRole('textbox', { name: 'Quick add task' }).fill(`Thing +${name}`);
	await expect(
		page.getByRole('list', { name: 'Parsed tokens' }).getByText(`+${name}`, { exact: true })
	).toBeVisible();
	await page.getByRole('textbox', { name: 'Quick add task' }).press('Enter');
	await expect(page.getByRole('status')).toContainText('Added');
	await page.goto('/projects');
	await expect(item.getByLabel('1 open')).toBeVisible();
});

test('shopping checklist add, tick, clear done', async ({ page }) => {
	const name = `Shop${uid()}`;
	await createProject(page, name, 'checklist');
	await page.getByRole('link', { name }).click();

	const add = page.getByLabel('Add item');
	for (const t of ['Milk', 'Eggs tomorrow']) {
		await add.fill(t);
		await add.press('Enter');
		await expect(page.getByRole('button', { name: t })).toBeVisible();
	}
	const items = page.getByRole('list', { name: 'Items' });
	const eggs = items.getByRole('button', { name: 'Eggs tomorrow' }); // literal title, no date parsing
	expect((await eggs.boundingBox())!.height).toBeGreaterThanOrEqual(52);

	await items.getByRole('button', { name: 'Milk' }).click();
	await expect(items.getByRole('button', { name: 'Milk' })).toBeHidden();
	await expect(page.getByText('Done (1)')).toBeVisible();
	await page.getByText('Done (1)').click();
	const done = page.getByRole('list', { name: 'Done items' });
	await expect(done.getByRole('button', { name: 'Milk' })).toBeVisible();

	// Tapping a done item brings it back.
	await done.getByRole('button', { name: 'Milk' }).click();
	await expect(items.getByRole('button', { name: 'Milk' })).toBeVisible();
	await expect(page.getByText(/^Done/)).toBeHidden();

	await items.getByRole('button', { name: 'Milk' }).click();
	await page.getByText('Done (1)').click();
	await page.getByRole('button', { name: 'Clear done' }).click();
	await expect(page.getByRole('status')).toContainText('Cleared 1 item');
	await expect(page.getByText(/^Done/)).toBeHidden();
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByText('Done (1)')).toBeVisible();

	await page.getByText('Done (1)').click();
	await page.getByRole('button', { name: 'Clear done' }).click();
	await expect(page.getByText(/^Done/)).toBeHidden();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Milk' })).toHaveCount(0);
	await expect(items.getByRole('button', { name: 'Eggs tomorrow' })).toBeVisible();
});

test('edit, archive, unarchive and delete a project', async ({ page }) => {
	const name = `Edit${uid()}`;
	await createProject(page, name);
	await page.getByRole('button', { name: `Edit ${name}` }).click();
	const sheet = page.getByRole('dialog', { name: 'Edit project' });
	await sheet.getByLabel('Name').fill(`${name}x`);
	await sheet.getByLabel('Green').check();
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('list', { name: 'Projects' }).getByText(`${name}x`)).toBeVisible();

	await page.getByRole('button', { name: `Edit ${name}x` }).click();
	await sheet.getByRole('button', { name: 'Archive' }).click();
	await expect(page.getByRole('list', { name: 'Projects' }).getByText(`${name}x`)).toBeHidden();
	await page.getByText(/^Archived/).click();
	await page.getByRole('button', { name: `Unarchive ${name}x` }).click();
	await expect(page.getByRole('list', { name: 'Projects' }).getByText(`${name}x`)).toBeVisible();

	await page.getByRole('button', { name: `Edit ${name}x` }).click();
	await sheet.getByRole('button', { name: 'Delete' }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete project' });
	await expect(confirm).toContainText('tasks move to Inbox');
	await confirm.getByRole('button', { name: 'Delete project' }).click();
	await expect(page.getByRole('list', { name: 'Projects' }).getByText(`${name}x`)).toBeHidden();
});

test('labels: count, rename, recolour and delete', async ({ page }) => {
	const label = `lab${uid()}`;
	await page.goto('/tasks');
	await page.getByRole('textbox', { name: 'Quick add task' }).fill(`Tagged #${label}`);
	await page.getByRole('textbox', { name: 'Quick add task' }).press('Enter');
	await expect(page.getByRole('status')).toContainText('Added');

	await page.goto('/labels');
	const item = page.getByRole('listitem').filter({ hasText: `#${label}` });
	await expect(item.getByLabel('1 open')).toBeVisible();
	await item.getByRole('button', { name: `Rename ${label}` }).click();
	await page.getByLabel('Name').fill(`${label}z`); // the row is a form now
	await page.getByLabel('Red').check();
	await page.getByRole('button', { name: 'Save' }).click();
	const renamed = page.getByRole('listitem').filter({ hasText: `#${label}z` });
	await expect(renamed).toBeVisible();
	await expect(renamed.locator('.dot')).toHaveCSS('background-color', 'rgb(224, 82, 82)');

	await renamed.getByRole('button', { name: `Delete ${label}z` }).click();
	await page
		.getByRole('dialog', { name: 'Delete label' })
		.getByRole('button', { name: 'Delete label' })
		.click();
	await expect(renamed).toBeHidden();
});
