const MIN = 60_000;
const MAX_FAILS = 5;
const WINDOW_MS = 15 * MIN;
const BASE_BLOCK_MS = 15 * MIN;
const MAX_BLOCK_MS = 24 * 60 * MIN;

type Entry = { fails: number[]; blockedUntil: number; blocks: number };

/** Behind ADDRESS_HEADER with no such header, getClientAddress throws: don't let that 500 login. */
export const clientIp = (e: { getClientAddress(): string }): string => {
	try {
		return e.getClientAddress();
	} catch {
		return 'unknown';
	}
};

// shortcut: in-memory, per process; resets on restart and never evicts idle keys (fine for single user)
export class RateLimiter {
	private map = new Map<string, Entry>();

	check(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
		const until = this.map.get(key)?.blockedUntil ?? 0;
		return until > now
			? { allowed: false, retryAfterSec: Math.ceil((until - now) / 1000) }
			: { allowed: true, retryAfterSec: 0 };
	}

	fail(key: string, now = Date.now()): void {
		const e = this.map.get(key) ?? { fails: [], blockedUntil: 0, blocks: 0 };
		this.map.set(key, e);
		if (e.blockedUntil > now) return;
		e.fails = e.fails.filter((t) => t > now - WINDOW_MS);
		e.fails.push(now);
		if (e.fails.length >= MAX_FAILS) {
			e.blockedUntil = now + Math.min(BASE_BLOCK_MS * 2 ** e.blocks, MAX_BLOCK_MS);
			e.blocks++;
			e.fails = [];
		}
	}

	reset(key: string): void {
		this.map.delete(key);
	}
}

// Shared by login and setup; keys are namespaced (`login:<ip>`, `setup:<ip>`).
export const limiter = new RateLimiter();
