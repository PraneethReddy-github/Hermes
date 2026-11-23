/// <reference types="@unplugin-pwa/core/vanillajs" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** package.json version, injected by Vite `define`. */
	const __APP_VERSION__: string;
	namespace App {
		// interface Error {}
		interface Locals {
			user: { id: string; username: string; timezone: string } | null;
			sessionId: string | null;
			theme: 'system' | 'dark' | 'light';
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
