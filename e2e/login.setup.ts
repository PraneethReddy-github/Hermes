import { STATE_FILE, expect, login, test as setup } from './fixtures';

// Runs after auth.e2e.ts (which creates the user) and saves a session for the other projects.
setup('log in', async ({ page }) => {
	await login(page);
	await expect(page).toHaveURL('/');
	await page.context().storageState({ path: STATE_FILE });
});
