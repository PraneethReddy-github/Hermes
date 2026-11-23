import { expect, test } from './fixtures';

const isDesktop = (page: { viewportSize(): { width: number } | null }) =>
	(page.viewportSize()?.width ?? 0) >= 1024;

test('bottom bar navigates to each tab', async ({ page }) => {
	test.skip(isDesktop(page), 'phone only');
	await page.goto('/');
	const bar = page.getByRole('navigation', { name: 'Main' });
	await expect(bar.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
	for (const [name, path] of [
		['Tasks', '/tasks'],
		['Calendar', '/calendar'],
		['Notes', '/notes'],
		['Today', '/']
	] as const) {
		await bar.getByRole('link', { name }).click();
		await expect(page).toHaveURL(path);
		await expect(bar.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
	}
	await expect(bar.getByRole('button', { name: 'Quick add' })).toBeVisible();
});

test('sidebar shown on desktop', async ({ page }) => {
	test.skip(!isDesktop(page), 'desktop only');
	await page.goto('/');
	const side = page.getByRole('navigation', { name: 'Main' });
	await expect(side).toBeVisible();
	for (const name of ['Today', 'Tasks', 'Calendar', 'Notes', 'Search', 'Settings'])
		await expect(side.getByRole('link', { name })).toBeVisible();
	await expect(page.getByRole('navigation')).toHaveCount(1); // bottom bar is display:none
});

test('response has CSP and nosniff headers', async ({ page }) => {
	const res = await page.request.get('/');
	const h = res.headers();
	const csp = h['content-security-policy'];
	for (const d of [
		"default-src 'self'",
		"img-src 'self' data:",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'"
	])
		expect(csp).toContain(d);
	expect(h['x-content-type-options']).toBe('nosniff');
	expect(h['referrer-policy']).toBe('same-origin');
	expect(h['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
});

test('manifest is served with name Hermes', async ({ request }) => {
	const res = await request.get('/manifest.webmanifest');
	expect(res.ok()).toBe(true);
	const m = (await res.json()) as { icons: unknown[] };
	expect(m).toMatchObject({ name: 'Hermes', short_name: 'Hermes', display: 'standalone' });
	expect(m.icons).toHaveLength(3);
});

test.describe('signed out', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('login page has no navigation', async ({ page }) => {
		await page.goto('/login');
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
		await expect(page.getByRole('navigation')).toHaveCount(0);
	});

	test('offline page is public', async ({ page }) => {
		await page.goto('/offline');
		await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
	});
});
