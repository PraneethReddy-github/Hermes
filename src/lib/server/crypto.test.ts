import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, loadKey } from './crypto';

describe('crypto', () => {
	let dir: string;
	const saved = process.env.HERMES_SECRET_KEY;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'hermes-crypto-'));
		delete process.env.HERMES_SECRET_KEY;
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		if (saved === undefined) delete process.env.HERMES_SECRET_KEY;
		else process.env.HERMES_SECRET_KEY = saved;
	});

	it('roundtrips and uses v1 format', () => {
		const key = randomBytes(32);
		const blob = encrypt('hello wörld', key);
		expect(blob.split(':')).toHaveLength(4);
		expect(blob.startsWith('v1:')).toBe(true);
		expect(decrypt(blob, key)).toBe('hello wörld');
	});

	it('produces different ciphertexts for same input', () => {
		const key = randomBytes(32);
		expect(encrypt('x', key)).not.toBe(encrypt('x', key));
	});

	it('throws on tampered ciphertext', () => {
		const key = randomBytes(32);
		const [v, iv, tag, ct] = encrypt('secret value', key).split(':');
		const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
		expect(() => decrypt([v, iv, tag, flipped].join(':'), key)).toThrow();
	});

	it('throws on wrong key and bad format', () => {
		const blob = encrypt('x', randomBytes(32));
		expect(() => decrypt(blob, randomBytes(32))).toThrow();
		expect(() => decrypt('v2:a:b:c', randomBytes(32))).toThrow();
	});

	it('loadKey creates 0600 32-byte file and reuses it', () => {
		const k1 = loadKey(dir);
		const path = join(dir, 'secrets.key');
		expect(k1).toHaveLength(32);
		expect(readFileSync(path)).toHaveLength(32);
		expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(loadKey(dir).equals(k1)).toBe(true);
	});

	it('throws on truncated auth tag', () => {
		const key = randomBytes(32);
		const [v, iv, tag, ct] = encrypt('secret value', key).split(':');
		const short = Buffer.from(tag, 'base64').subarray(0, 4).toString('base64');
		expect(() => decrypt([v, iv, short, ct].join(':'), key)).toThrow();
	});

	it('loadKey rejects existing key file of wrong length', () => {
		writeFileSync(join(dir, 'secrets.key'), randomBytes(16));
		expect(() => loadKey(dir)).toThrow(/32 bytes/);
	});

	it('loadKey prefers HERMES_SECRET_KEY env', () => {
		const k = randomBytes(32);
		process.env.HERMES_SECRET_KEY = k.toString('base64');
		expect(loadKey(dir).equals(k)).toBe(true);
	});

	it('loadKey rejects env key not 32 bytes', () => {
		process.env.HERMES_SECRET_KEY = randomBytes(16).toString('base64');
		expect(() => loadKey(dir)).toThrow(/32 bytes/);
	});
});
