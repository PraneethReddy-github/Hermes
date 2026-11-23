import { expect, test, type Page } from './fixtures';

const uid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

async function createNote(
	page: Page,
	o: { title?: string; body?: string; kind?: string; pin?: boolean }
) {
	await page.goto('/notes/new');
	if (o.title) await page.getByLabel('Title').fill(o.title);
	if (o.kind) await page.getByLabel('Kind').selectOption(o.kind);
	if (o.pin) await page.getByLabel('Pinned').check();
	if (o.body) await page.getByLabel('Body').fill(o.body);
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForURL(/\/notes\/[0-9A-Z]{26}$/);
}

test('create idea note, pin it, appears first', async ({ page }) => {
	const id = uid();
	await createNote(page, { title: `Plain ${id}`, kind: 'idea' });
	await createNote(page, {
		title: `Pinned ${id}`,
		kind: 'idea',
		pin: true,
		body: '# Heading\nbody'
	});

	await page.goto('/notes?kind=idea');
	const rows = page.getByRole('list', { name: 'Notes' }).getByRole('listitem');
	const texts = await rows.allInnerTexts();
	const at = (t: string) => texts.findIndex((x) => x.includes(`${t} ${id}`));
	expect(at('Pinned')).toBeGreaterThanOrEqual(0);
	expect(at('Pinned')).toBeLessThan(at('Plain'));
	const pinned = rows.filter({ hasText: `Pinned ${id}` });
	await expect(pinned.getByLabel('Pinned')).toBeVisible();
	await expect(pinned).toContainText('Heading'); // preview with markdown stripped
	await expect(page.getByRole('radio', { name: 'Ideas' })).toBeChecked();

	// Another kind hides it; an invalid kind shows All.
	await page.getByRole('radio', { name: 'Research' }).check();
	await expect(page).toHaveURL(/kind=research/);
	await expect(rows.filter({ hasText: `Pinned ${id}` })).toHaveCount(0);
	await page.goto('/notes?kind=bogus');
	await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
	await expect(rows.filter({ hasText: `Pinned ${id}` })).toHaveCount(1);
});

test('markdown <script> is not executed or rendered', async ({ page }) => {
	const id = uid();
	const body = `# Hi ${id}\n\n<script>window.__xss=1</script>\n\n<img src=x onerror="window.__xss=1">\n\n[link](https://example.com)`;
	await createNote(page, { title: `XSS ${id}`, body });

	for (const reload of [false, true]) {
		if (reload) await page.reload();
		await page.getByRole('button', { name: 'Preview' }).click();
		const md = page.getByTestId('markdown');
		await expect(md.getByRole('heading', { name: `Hi ${id}` })).toBeVisible();
		await expect(md.locator('script')).toHaveCount(0);
		await expect(md.getByRole('link', { name: 'link' })).toHaveAttribute(
			'rel',
			'noopener noreferrer'
		);
		await page.waitForTimeout(300);
		expect(
			await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)
		).toBeUndefined();
	}

	// The list shows plain text only.
	await page.goto('/notes');
	await expect(page.getByRole('list', { name: 'Notes' }).locator('script, img')).toHaveCount(0);
});

test('unsaved guard, edit, delete with undo, deleted id is 404', async ({ page }) => {
	const id = uid();
	await createNote(page, { title: `Edit ${id}`, body: 'first' });
	const url = page.url();

	// Dirty + navigate away asks first; dismissing keeps us here.
	await page.getByLabel('Body').fill('changed');
	let asked = 0;
	page.once('dialog', (d) => {
		asked++;
		void d.dismiss();
	});
	await page.getByRole('link', { name: 'All notes' }).click();
	await expect.poll(() => asked).toBe(1);
	expect(page.url()).toBe(url);

	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('Saved');
	await page.reload();
	await expect(page.getByLabel('Body')).toHaveValue('changed');

	// Saved: leaving does not prompt.
	await page.getByRole('button', { name: 'Delete' }).click();
	await page
		.getByRole('dialog', { name: 'Delete this note?' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page).toHaveURL(/\/notes$/);
	const row = page
		.getByRole('list', { name: 'Notes' })
		.getByRole('listitem')
		.filter({ hasText: `Edit ${id}` });
	await expect(row).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(row).toHaveCount(1);

	await row.getByRole('link').click();
	await page.getByRole('button', { name: 'Delete' }).click();
	await page
		.getByRole('dialog', { name: 'Delete this note?' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page).toHaveURL(/\/notes$/);
	expect((await page.goto(url))?.status()).toBe(404);
});

test('a failed save keeps the note dirty and never says Saved', async ({ page }) => {
	const id = uid();
	await createNote(page, { title: `Fail ${id}`, body: 'first' });
	const url = page.url();
	await page.getByLabel('Body').fill('changed');
	await page.route('**/notes/*?/save', (r) => r.fulfill({ status: 500, body: 'boom' }));
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('alert')).toBeVisible();
	await expect(page.getByRole('status')).not.toContainText('Saved');

	let asked = 0;
	page.once('dialog', (d) => {
		asked++;
		void d.dismiss();
	});
	await page.getByRole('link', { name: 'All notes' }).click();
	await expect.poll(() => asked).toBe(1);
	expect(page.url()).toBe(url);
});
