import { test as base, type Page } from '@playwright/test';

export { expect } from '@playwright/test';
export type { Locator, Page } from '@playwright/test';

// Full page loads resolve before hydration; wait for the root layout's onMount marker.
export const test = base.extend({
	page: async ({ page }, use) => {
		for (const m of ['goto', 'reload'] as const) {
			const orig = page[m].bind(page) as (...a: unknown[]) => ReturnType<typeof page.goto>;
			Object.assign(page, {
				[m]: async (...a: unknown[]) => {
					const res = await orig(...a);
					if (res?.headers()['content-type']?.includes('text/html'))
						await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
					return res;
				}
			});
		}
		await use(page);
	}
});

export const USER = 'alice';
export const PASSWORD = 'correct horse battery';
/** Written by e2e/login.setup.ts; the mobile and desktop projects start logged in with it. */
export const STATE_FILE = './.e2e-data/state.json';

export async function login(page: Page, password = PASSWORD) {
	await page.goto('/login');
	await page.getByLabel('Username').fill(USER);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}
