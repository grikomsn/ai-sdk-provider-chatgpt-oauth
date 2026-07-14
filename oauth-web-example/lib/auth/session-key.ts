import { scryptSync } from 'node:crypto';

const MINIMUM_SECRET_BYTES = 32;
const KEY_LENGTH = 32;
const SCRYPT_SALT = 'chatgpt-oauth-web-example/session/v2';

function decodedSecretBytes(secret: string): Buffer | null {
  if (/^[a-f\d]{64,}$/i.test(secret) && secret.length % 2 === 0) {
    return Buffer.from(secret, 'hex');
  }

  if (!/^[A-Za-z\d+/_-]+={0,2}$/.test(secret)) {
    return null;
  }

  const decoded = Buffer.from(secret, 'base64');
  const normalizedInput = secret.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const normalizedOutput = decoded.toString('base64').replace(/=+$/, '');
  return normalizedInput === normalizedOutput ? decoded : null;
}

export function validateSessionSecret(secret = process.env.SESSION_SECRET): string {
  const decoded = secret ? decodedSecretBytes(secret) : null;
  if (!secret || !decoded || decoded.length < MINIMUM_SECRET_BYTES || new Set(decoded).size < 8) {
    throw new Error(
      'SESSION_SECRET must encode at least 32 random bytes as hexadecimal or base64.'
    );
  }

  return secret;
}

export function deriveSessionKey(secret?: string): Buffer {
  return scryptSync(validateSessionSecret(secret), SCRYPT_SALT, KEY_LENGTH, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
}
