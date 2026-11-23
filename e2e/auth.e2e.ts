import { readFileSync } from 'node:fs';
import * as OTPAuth from 'otpauth';
import { PASSWORD, USER, expect, login, test } from './fixtures';

// State (the single user) is shared across tests, so run in order, in one project only (the `auth` project).
test.describe.configure({ mode: 'serial' });

test('setup creates user and lands on Today', async ({ page }) => {
	await page.goto('/tasks');
	await expect(page).toHaveURL(/\/setup$/);
	const token = readFileSync('./.e2e-data/setup-token.txt', 'utf8'); // written on first /setup load
	await page.getByLabel('Setup token').fill(token);
	await page.getByLabel('Username').fill(USER);
	await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
	await page.getByLabel('Confirm password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL('/');
});

test('setup returns 404 after user exists', async ({ page }) => {
	const res = await page.goto('/setup');
	expect(res?.status()).toBe(404);
});

test('login with wrong password shows error', async ({ page }) => {
	await login(page, 'not the password');
	await expect(page.getByText('Wrong username or password')).toBeVisible();
	await expect(page).toHaveURL(/\/login/);
});

test('logout then protected page redirects to /login?next=/tasks', async ({ page }) => {
	await login(page);
	await expect(page).toHaveURL('/');
	await page.goto('/settings/security');
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/tasks');
	await expect(page).toHaveURL('/login?next=/tasks');
});

test('totp: enable, login asks for code, disable', async ({ page }) => {
	const code = (secret: string) =>
		new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate();
	await login(page);
	await expect(page).toHaveURL('/');
	await page.goto('/settings/security');
	await page.getByRole('button', { name: 'Set up two-factor' }).click();
	const secret = (await page.locator('code').innerText()).trim();
	await page.locator('form[action="?/enableTotp"]').getByLabel('Current password').fill(PASSWORD);
	await page.getByLabel('Code from the app').fill(code(secret));
	await page.getByRole('button', { name: 'Enable two-factor' }).click();
	await expect(page.getByText('Two-factor authentication is on.')).toBeVisible();

	// Server must refuse to replace an existing secret, even with a valid code for a new one.
	const evil = new OTPAuth.Secret({ size: 20 }).base32;
	const res = await page.request.post('/settings/security?/enableTotp', {
		headers: { accept: 'application/json', origin: new URL(page.url()).origin },
		form: { secret: evil, code: code(evil), current: PASSWORD }
	});
	expect(await res.text()).toContain('Two-factor is already on');

	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await login(page);
	await page.getByLabel('Authentication code').fill(code(secret));
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/');

	await page.goto('/settings/security');
	await page.getByLabel('Authentication code to turn off').fill(code(secret));
	await page.getByRole('button', { name: 'Disable two-factor' }).click();
	await expect(page.getByText('Two-factor authentication is off.')).toBeVisible();
});
