import { describe, expect, it } from 'vitest';
import { deriveLegacySessionKey, deriveSessionKey, validateSessionSecret } from './session-key';

describe('session key derivation', () => {
  it('rejects short and repeating secrets', () => {
    expect(() => validateSessionSecret('short')).toThrow(/32 random bytes/);
    expect(() => validateSessionSecret('a'.repeat(64))).toThrow(/randomly generated/);
  });

  it('derives a stable 256-bit scrypt key distinct from the legacy key', () => {
    const secret = '0123456789abcdef'.repeat(4);
    const key = deriveSessionKey(secret);

    expect(key).toHaveLength(32);
    expect(key.equals(deriveSessionKey(secret))).toBe(true);
    expect(key.equals(deriveLegacySessionKey(secret))).toBe(false);
  });
});
