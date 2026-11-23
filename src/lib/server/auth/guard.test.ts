import { describe, expect, it } from 'vitest';
import { actionOnlyLoad, decideRoute, safeNext } from './guard';

const base = { method: 'GET', accept: 'text/html', hasUser: false, userExists: true } as const;
const next = { kind: 'next' };

describe('decideRoute', () => {
	it('serves the offline page without a session', () => {
		expect(decideRoute({ ...base, path: '/offline' })).toEqual(next);
	});
	it('lets authenticated requests through', () => {
		expect(decideRoute({ ...base, path: '/tasks', hasUser: true })).toEqual(next);
	});
	it('redirects unauth GET to login with next', () => {
		expect(decideRoute({ ...base, path: '/tasks' })).toEqual({
			kind: 'redirect',
			location: '/login?next=/tasks'
		});
	});
	it('keeps query in next, encoded', () => {
		expect(decideRoute({ ...base, path: '/tasks', search: '?a=1&b=2' })).toEqual({
			kind: 'redirect',
			location: '/login?next=/tasks%3Fa%3D1%26b%3D2'
		});
	});
	it('401 for unauth non-GET wanting JSON', () => {
		expect(
			decideRoute({ ...base, method: 'POST', path: '/api/x', accept: 'application/json' })
		).toEqual({ kind: 'status', status: 401 });
	});
	it('303 to login with referer path for unauth form POST', () => {
		expect(
			decideRoute({
				...base,
				method: 'POST',
				path: '/tasks',
				referer: 'http://localhost:3000/inbox?x=1'
			})
		).toEqual({ kind: 'redirect', location: '/login?next=/inbox%3Fx%3D1' });
	});
	it('form POST without usable referer falls back to /', () => {
		const r = { kind: 'redirect', location: '/login?next=/' };
		expect(decideRoute({ ...base, method: 'POST', path: '/tasks' })).toEqual(r);
		expect(decideRoute({ ...base, method: 'POST', path: '/tasks', referer: 'not a url' })).toEqual(
			r
		);
	});
	it('never produces protocol-relative next', () => {
		expect(
			decideRoute({ ...base, method: 'POST', path: '/t', referer: 'http://h//evil.com/x' })
		).toEqual({ kind: 'redirect', location: '/login?next=/' });
	});
	it('public paths pass without auth', () => {
		for (const path of [
			'/login',
			'/setup',
			'/manifest.webmanifest',
			'/_app/immutable/a.js',
			'/icons/a.png',
			'/sw.js',
			'/workbox-abc.js',
			'/robots.txt'
		])
			expect(decideRoute({ ...base, path })).toEqual(next);
	});
	it('does not treat lookalike prefixes as public', () => {
		expect(decideRoute({ ...base, path: '/login-x' }).kind).toBe('redirect');
		expect(decideRoute({ ...base, path: '/setupx' }).kind).toBe('redirect');
	});
	it('no user exists: everything but public paths -> /setup', () => {
		const b = { ...base, userExists: false };
		expect(decideRoute({ ...b, path: '/tasks' })).toEqual({ kind: 'redirect', location: '/setup' });
		expect(decideRoute({ ...b, method: 'POST', path: '/tasks' })).toEqual({
			kind: 'redirect',
			location: '/setup'
		});
		expect(decideRoute({ ...b, path: '/setup' })).toEqual(next);
		expect(decideRoute({ ...b, path: '/_app/x.js' })).toEqual(next);
	});
});

describe('safeNext', () => {
	it('allows only same-origin paths', () => {
		expect(safeNext('/tasks?a=1')).toBe('/tasks?a=1');
		for (const bad of [
			'//evil.com',
			'/\\evil.com',
			'/\t/evil.com',
			'/\n/evil.com',
			'/\r/evil.com',
			'https://evil.com',
			'',
			null,
			undefined
		])
			expect(safeNext(bad)).toBe('/');
	});
});

describe('actionOnlyLoad', () => {
	const run = (method: string, referer?: string) => {
		const headers = new Headers(referer ? { referer } : {});
		try {
			actionOnlyLoad({ request: new Request('http://x/tasks/1', { method, headers }) });
		} catch (e) {
			return e as { status: number; location?: string };
		}
	};
	it('sends a native POST back to the referring path', () => {
		expect(run('POST', 'http://x/projects/p1?a=1')).toMatchObject({
			status: 303,
			location: '/projects/p1?a=1'
		});
		expect(run('POST')).toMatchObject({ status: 303, location: '/' });
	});
	it('404s a GET', () => {
		expect(run('GET')).toMatchObject({ status: 404 });
	});
});
