import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
	it('roundtrips and rejects wrong password', async () => {
		const hash = await hashPassword('correct horse');
		expect(hash).toMatch(/^\$argon2id\$/);
		expect(await verifyPassword(hash, 'correct horse')).toBe(true);
		expect(await verifyPassword(hash, 'wrong')).toBe(false);
	});
	it('returns false for a malformed hash', async () => {
		expect(await verifyPassword('garbage', 'x')).toBe(false);
	});
});
