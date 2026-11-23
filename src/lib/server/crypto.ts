import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;

export function loadKey(dataDir: string): Buffer {
	const env = process.env.HERMES_SECRET_KEY;
	if (env) return checkKey(Buffer.from(env, 'base64'), 'HERMES_SECRET_KEY');
	const path = join(dataDir, 'secrets.key');
	const key = randomBytes(KEY_LEN);
	try {
		// 'wx' makes first creation atomic; a concurrent loser reads the winner's key
		writeFileSync(path, key, { mode: 0o600, flag: 'wx' });
		return key;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
		return checkKey(readFileSync(path), path);
	}
}

function checkKey(key: Buffer, source: string): Buffer {
	if (key.length !== KEY_LEN) {
		throw new Error(`${source} must decode to exactly ${KEY_LEN} bytes (got ${key.length})`);
	}
	return key;
}

export function encrypt(plain: string, key: Buffer): string {
	const iv = randomBytes(IV_LEN);
	const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
	const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return ['v1', iv, cipher.getAuthTag(), ct]
		.map((p) => (typeof p === 'string' ? p : p.toString('base64')))
		.join(':');
}

export function decrypt(blob: string, key: Buffer): string {
	const [v, iv, tag, ct, ...rest] = blob.split(':');
	if (v !== 'v1' || !iv || !tag || ct === undefined || rest.length) {
		throw new Error('Invalid ciphertext format');
	}
	const ivBuf = Buffer.from(iv, 'base64');
	const tagBuf = Buffer.from(tag, 'base64');
	if (ivBuf.length !== IV_LEN || tagBuf.length !== TAG_LEN) {
		throw new Error('Invalid ciphertext format');
	}
	const decipher = createDecipheriv(ALGO, key, ivBuf, { authTagLength: TAG_LEN });
	decipher.setAuthTag(tagBuf);
	return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString(
		'utf8'
	);
}

/** The app secret key, from HERMES_SECRET_KEY or `${HERMES_DATA_DIR}/secrets.key`. */
export function dataKey(): Buffer {
	const dir = process.env.HERMES_DATA_DIR ?? './data';
	mkdirSync(dir, { recursive: true });
	return loadKey(dir);
}
