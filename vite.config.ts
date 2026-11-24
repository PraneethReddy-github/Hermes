import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { withPwa } from '@vite-pwa/sveltekit';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
	// Never inline fonts: the CSP (default-src 'self') has no data: for fonts.
	build: { assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined) },
	define: { __APP_VERSION__: JSON.stringify(version) },
	plugins: [
		tailwindcss(),
		...withPwa(
			{
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				adapter: adapter(),

				// Nonces/hashes are added by SvelteKit for its own inline scripts.
				csp: {
					mode: 'auto',
					directives: {
						'default-src': ['self'],
						'img-src': ['self', 'data:'],
						'style-src': ['self', 'unsafe-inline'],
						'object-src': ['none'],
						'frame-ancestors': ['none'],
						'base-uri': ['self'],
						'form-action': ['self']
					}
				}
			},
			{
				registerType: 'autoUpdate',
				// Absolute: the register script is otherwise relative to the current page.
				base: '/',
				scope: '/',
				injectRegister: false,
				// Precache the built app shell only; src/sw.ts keeps authenticated pages out of caches.
				strategies: 'buildSW',
				// globStrict off: this app prerenders nothing.
				buildSW: {
					swSrc: 'src/sw.ts',
					globStrict: false,
					// Kit's defaults plus the bundled fonts (woff2 only; the woff fallback is never needed).
					globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,webmanifest,woff2}']
				},
				manifest: {
					name: 'Hermes',
					short_name: 'Hermes',
					start_url: '/',
					display: 'standalone',
					theme_color: '#0B0C0E',
					background_color: '#0B0C0E',
					icons: [
						{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
						{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
						{
							src: '/icons/icon-maskable-512.png',
							sizes: '512x512',
							type: 'image/png',
							purpose: 'maskable'
						}
					]
				}
			}
		)
	],
	test: {
		expect: { requireAssertions: true },
		passWithNoTests: true,
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
