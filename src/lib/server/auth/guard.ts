import { error, redirect } from '@sveltejs/kit';

export type RouteDecision =
	{ kind: 'next' } | { kind: 'redirect'; location: string } | { kind: 'status'; status: number };

export type GuardInput = {
	path: string;
	search?: string;
	method: string;
	accept: string;
	hasUser: boolean;
	userExists: boolean;
	referer?: string | null;
};

const PUBLIC_EXACT = [
	'/login',
	'/setup',
	'/offline',
	'/manifest.webmanifest',
	'/sw.js',
	'/robots.txt'
];
const PUBLIC_PREFIX = ['/_app/', '/icons/', '/workbox-'];

export const isPublicPath = (p: string): boolean =>
	PUBLIC_EXACT.includes(p) || PUBLIC_PREFIX.some((x) => p.startsWith(x));

// Only same-origin absolute paths; "//host" and "/\host" are open redirects.
export const safeNext = (next: string | null | undefined): string =>
	// Control chars (tab/newline) are stripped by browsers when parsing Location, turning "/\t/evil" into "//evil".
	// eslint-disable-next-line no-control-regex
	next && next.startsWith('/') && !next.startsWith('//') && !/[\u0000-\u001f\u007f\\]/.test(next)
		? next
		: '/';

const loginFor = (next: string) =>
	`/login?next=${encodeURIComponent(safeNext(next)).replaceAll('%2F', '/')}`;

/** Action-only routes: a native (non-enhanced) POST lands here after the action ran, so go back. */
export function actionOnlyLoad({ request }: { request: Request }): never {
	if (request.method === 'POST')
		redirect(303, safeNext(refererPath(request.headers.get('referer'))));
	error(404, 'Not found');
}

function refererPath(referer?: string | null): string {
	if (!referer) return '/';
	try {
		const u = new URL(referer);
		return u.pathname + u.search;
	} catch {
		return '/';
	}
}

export function decideRoute(i: GuardInput): RouteDecision {
	if (isPublicPath(i.path)) return { kind: 'next' };
	if (!i.userExists) return { kind: 'redirect', location: '/setup' };
	if (i.hasUser) return { kind: 'next' };
	if (i.method === 'GET' || i.method === 'HEAD')
		return { kind: 'redirect', location: loginFor(i.path + (i.search ?? '')) };
	if (i.accept.includes('json')) return { kind: 'status', status: 401 };
	return { kind: 'redirect', location: loginFor(refererPath(i.referer)) };
}
