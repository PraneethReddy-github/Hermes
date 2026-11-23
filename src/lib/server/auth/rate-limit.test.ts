import { describe, expect, it } from 'vitest';
import { RateLimiter, clientIp } from './rate-limit';

const MIN = 60_000;

describe('RateLimiter', () => {
	it('blocks after 5 failures, unblocks after 15 min, doubles next block', () => {
		const rl = new RateLimiter();
		let t = 1_000_000;
		for (let i = 0; i < 5; i++) {
			expect(rl.check('k', t).allowed).toBe(true);
			rl.fail('k', t);
		}
		const blocked = rl.check('k', t);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterSec).toBe(900);
		expect(rl.check('other', t).allowed).toBe(true);

		t += 15 * MIN;
		expect(rl.check('k', t).allowed).toBe(true);
		for (let i = 0; i < 5; i++) rl.fail('k', t);
		expect(rl.check('k', t).retryAfterSec).toBe(1800);
	});

	it('forgets failures older than 15 min', () => {
		const rl = new RateLimiter();
		for (let i = 0; i < 4; i++) rl.fail('k', 0);
		rl.fail('k', 16 * MIN);
		expect(rl.check('k', 16 * MIN).allowed).toBe(true);
	});

	it('caps block at 24h', () => {
		const rl = new RateLimiter();
		let t = 0;
		for (let b = 0; b < 12; b++) {
			for (let i = 0; i < 5; i++) rl.fail('k', t);
			const { retryAfterSec } = rl.check('k', t);
			expect(retryAfterSec).toBeLessThanOrEqual(86_400);
			t += retryAfterSec * 1000;
		}
		for (let i = 0; i < 5; i++) rl.fail('k', t);
		expect(rl.check('k', t).retryAfterSec).toBe(86_400);
	});

	it('reset clears state', () => {
		const rl = new RateLimiter();
		for (let i = 0; i < 5; i++) rl.fail('k', 0);
		rl.reset('k');
		expect(rl.check('k', 0).allowed).toBe(true);
	});
});

describe('clientIp', () => {
	it('returns the address, or "unknown" when SvelteKit cannot determine it', () => {
		expect(clientIp({ getClientAddress: () => '1.2.3.4' })).toBe('1.2.3.4');
		expect(
			clientIp({
				getClientAddress: () => {
					throw new Error('Address header was specified but is absent from request');
				}
			})
		).toBe('unknown');
	});
});
