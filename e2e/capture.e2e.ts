import { expect, test, type Page } from './fixtures';

// Letters only, so the quick-add parser never reads the title as a date.
const uid = () =>
	[...`${Date.now()}${Math.floor(Math.random() * 1000)}`].map((c) => 'abcdefghij'[+c]).join('');

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Quick add' });
const input = (page: Page) => dialog(page).getByRole('textbox', { name: 'Capture' });
const pill = (page: Page, name: string) => dialog(page).getByRole('radio', { name });
const toast = (page: Page) => dialog(page).getByRole('status');

async function openSheet(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: 'Quick add' }).click();
	await expect(dialog(page)).toBeVisible();
	await expect(input(page)).toBeFocused(); // keyboard up without a second tap
}

async function capture(page: Page, text: string) {
	await input(page).fill(text);
	await input(page).press('Enter');
}

test('capture "buy eggs" lands in Shopping, input stays ready, Undo removes it', async ({
	page
}) => {
	const t = `eggs ${uid()}`;
	await openSheet(page);
	await input(page).fill(`buy ${t}`);
	await expect(pill(page, 'Shopping')).toBeChecked();
	await input(page).press('Enter');
	await expect(toast(page)).toContainText('Saved to Shopping');
	await expect(input(page)).toHaveValue('');
	await expect(input(page)).toBeFocused();
	await expect(dialog(page)).toBeVisible(); // stays open for the next capture
	await expect(pill(page, 'Task')).toBeChecked(); // pills reset

	await page.goto('/tasks/projects');
	await page.getByRole('link', { name: 'Shopping' }).click();
	await expect(page.getByText(t)).toBeVisible();

	await openSheet(page);
	await capture(page, `buy ${t} again`);
	await toast(page).getByRole('button', { name: 'Undo' }).click(); // reachable above the modal
	await page.goto('/tasks/projects');
	await page.getByRole('link', { name: 'Shopping' }).click();
	await expect(page.getByText(`${t} again`)).toBeHidden();
	await expect(page.getByText(t, { exact: true })).toBeVisible();
});

test('switching pill to Note saves a note; the choice sticks while typing', async ({ page }) => {
	await openSheet(page);
	await input(page).fill(`plain ${uid()}`);
	await expect(pill(page, 'Task')).toBeChecked();
	await pill(page, 'Note').check();
	await input(page).pressSequentially(' more');
	await expect(pill(page, 'Note')).toBeChecked();
	await input(page).press('Enter');
	await expect(toast(page)).toContainText('Saved to Notes');
});

test('time range becomes an event; pills are arrow-key navigable', async ({ page }) => {
	test.skip(test.info().project.name === 'mobile', 'keyboard focus');
	await openSheet(page);
	await input(page).fill(`meet Anna thu 14-15 ${uid()}`);
	await expect(pill(page, 'Event')).toBeChecked();
	await pill(page, 'Event').focus();
	await page.keyboard.press('ArrowRight');
	await expect(pill(page, 'Note')).toBeChecked();
	await page.keyboard.press('ArrowLeft');
	await expect(pill(page, 'Event')).toBeChecked();
	await input(page).press('Enter');
	await expect(toast(page)).toContainText('Saved to Calendar');
});

test('task with a due date reports where it landed', async ({ page }) => {
	await openSheet(page);
	await capture(page, `write ${uid()} today`);
	await expect(toast(page)).toContainText('Saved to Today');
});

test('Esc closes the sheet', async ({ page }) => {
	await openSheet(page);
	await page.keyboard.press('Escape');
	await expect(dialog(page)).toBeHidden();
});

test('a click near the sheet edge stays open; a backdrop click closes', async ({ page }) => {
	await openSheet(page);
	const box = (await dialog(page).boundingBox())!;
	await page.mouse.click(box.x + 4, box.y + box.height / 2); // padding of the sheet, not backdrop
	await expect(dialog(page)).toBeVisible();
	await page.mouse.click(box.x + box.width / 2, 4); // above the sheet: the ::backdrop
	await expect(dialog(page)).toBeHidden();
});
