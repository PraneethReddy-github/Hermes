import { defineConfig, devices } from '@playwright/test';
import { STATE_FILE } from './e2e/fixtures';

const ignored = ['**/auth.e2e.ts', '**/settings.e2e.ts'];
const loggedIn = { storageState: STATE_FILE };

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.{ts,js}',
	globalSetup: './e2e/global-setup.ts',
	webServer: {
		command: 'npm run build && npm run preview -- --port 4173',
		port: 4173,
		timeout: 120_000,
		env: { HERMES_DATA_DIR: './.e2e-data', HERMES_E2E: '1' }
	},
	projects: [
		// Creates the single user, so everything else depends on it.
		{ name: 'auth', use: { ...devices['Desktop Chrome'] }, testMatch: '**/auth.e2e.ts' },
		{
			name: 'login',
			use: { ...devices['Desktop Chrome'] },
			testMatch: '**/login.setup.ts',
			dependencies: ['auth'],
			// Runs after login and everything that depends on it, and is never skipped for their failures.
			teardown: 'settings'
		},
		{
			name: 'mobile',
			use: { ...devices['Pixel 7'], ...loggedIn },
			testIgnore: ignored,
			dependencies: ['login']
		},
		{
			name: 'desktop',
			use: { ...devices['Desktop Chrome'], ...loggedIn },
			testIgnore: ignored,
			dependencies: ['login']
		},
		// Changes the shared user's timezone/theme: runs alone, after everything else (login's teardown).
		{
			name: 'settings',
			use: { ...devices['Desktop Chrome'], ...loggedIn },
			testMatch: '**/settings.e2e.ts'
		}
	]
});
