import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveSessionKey, validateSessionSecret } from './session-key';

describe('session key derivation', () => {
  it('rejects short, repeating, and passphrase secrets', () => {
    expect(() => validateSessionSecret('short')).toThrow(/32 random bytes/);
    expect(() => validateSessionSecret('a'.repeat(64))).toThrow(/32 random bytes/);
    expect(() => validateSessionSecret('correct horse battery staple correct horse')).toThrow(
      /hexadecimal or base64/
    );
    const structuredPattern = Buffer.from(
      Array.from({ length: 48 }, (_, index) => index % 24)
    ).toString('hex');
    expect(() => validateSessionSecret(structuredPattern)).toThrow(/32 random bytes/);
  });

  it('accepts random hexadecimal and base64 encodings', () => {
    expect(validateSessionSecret(randomBytes(32).toString('hex'))).toHaveLength(64);
    expect(validateSessionSecret(randomBytes(32).toString('base64'))).toBeTypeOf('string');
  });

  it('derives a stable 256-bit scrypt key', () => {
    const secret = randomBytes(32).toString('hex');
    const key = deriveSessionKey(secret);

    expect(key).toHaveLength(32);
    expect(key.equals(deriveSessionKey(secret))).toBe(true);
  });
});
