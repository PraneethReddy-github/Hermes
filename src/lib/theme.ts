export const THEMES = ['system', 'dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

/** Theme from users.settings_json; anything missing or invalid is 'system'. */
export function parseTheme(settingsJson: string | null | undefined): Theme {
	try {
		const t = (JSON.parse(settingsJson ?? '{}') as { theme?: Theme } | null)?.theme;
		return t && THEMES.includes(t) ? t : 'system';
	} catch {
		return 'system';
	}
}
