import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 defaults to argon2id.
export const hashPassword = (pw: string): Promise<string> => hash(pw);

export async function verifyPassword(hashed: string, pw: string): Promise<boolean> {
	try {
		return await verify(hashed, pw);
	} catch {
		return false; // malformed hash
	}
}
