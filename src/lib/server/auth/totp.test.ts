import { describe, expect, it } from 'vitest';
import * as OTPAuth from 'otpauth';
import { newTotpSecret, totpUri, verifyTotp } from './totp';

const gen = (secret: string, offsetSteps = 0) =>
	new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate({
		timestamp: Date.now() + offsetSteps * 30_000
	});

describe('totp', () => {
	it('verifies current and adjacent codes, rejects others', () => {
		const s = newTotpSecret();
		expect(verifyTotp(s, gen(s))).toBe(true);
		expect(verifyTotp(s, gen(s, -1))).toBe(true);
		expect(verifyTotp(s, gen(s, 1))).toBe(true);
		expect(verifyTotp(s, gen(s, 3))).toBe(false);
		expect(verifyTotp(s, 'abc')).toBe(false);
	});
	it('builds otpauth uri with issuer Hermes', () => {
		const s = newTotpSecret();
		const uri = totpUri(s, 'me');
		expect(uri).toMatch(/^otpauth:\/\/totp\/Hermes:me\?/);
		expect(uri).toContain(`secret=${s}`);
		expect(uri).toContain('issuer=Hermes');
	});
});
