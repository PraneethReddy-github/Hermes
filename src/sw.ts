/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const OFFLINE_CACHE = 'hermes-offline';

// Built app shell assets only.
precacheAndRoute(self.__WB_MANIFEST);

// registerType 'autoUpdate': take over as soon as a new worker is installed.
self.addEventListener('install', (e) => {
	// The offline page is public and per-user-free; it is the only HTML ever cached.
	e.waitUntil(caches.open(OFFLINE_CACHE).then((c) => c.add('/offline')));
	void self.skipWaiting();
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Pages are per-user and never cached: network, else the offline page.
self.addEventListener('fetch', (e) => {
	if (e.request.mode === 'navigate')
		e.respondWith(
			fetch(e.request).catch(async () => (await caches.match('/offline')) ?? Response.error())
		);
});
