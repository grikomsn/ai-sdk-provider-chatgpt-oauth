import { createHash, scryptSync } from 'node:crypto';

const MINIMUM_SECRET_BYTES = 32;
const MINIMUM_UNIQUE_CHARACTERS = 8;
const KEY_LENGTH = 32;
const SCRYPT_SALT = 'chatgpt-oauth-web-example/session/v2';

export function validateSessionSecret(secret = process.env.SESSION_SECRET): string {
  if (!secret || Buffer.byteLength(secret, 'utf8') < MINIMUM_SECRET_BYTES) {
    throw new Error('SESSION_SECRET must contain at least 32 random bytes.');
  }

  if (new Set(secret).size < MINIMUM_UNIQUE_CHARACTERS) {
    throw new Error('SESSION_SECRET must be randomly generated, not a repeating value.');
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

export function deriveLegacySessionKey(secret?: string): Buffer {
  return createHash('sha256').update(validateSessionSecret(secret)).digest();
}
