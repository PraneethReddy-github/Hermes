import * as OTPAuth from 'otpauth';

const make = (secret: string, label = 'user') =>
	new OTPAuth.TOTP({ issuer: 'Hermes', label, secret: OTPAuth.Secret.fromBase32(secret) });

export const newTotpSecret = (): string => new OTPAuth.Secret({ size: 20 }).base32;

export const totpUri = (secret: string, username: string): string =>
	make(secret, username).toString();

export function verifyTotp(secret: string, code: string): boolean {
	return make(secret).validate({ token: code.trim(), window: 1 }) !== null;
}
