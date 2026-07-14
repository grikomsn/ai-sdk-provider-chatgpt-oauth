import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { acquireOperationLock, checkRateLimit } from './rate-limit';

describe('request guards', () => {
  it('limits repeated requests from the same forwarded client', () => {
    const request = new Request('https://chat.example.com/api/auth/device/start', {
      headers: { 'x-forwarded-for': '192.0.2.1' },
    });
    const scope = randomUUID();

    expect(checkRateLimit(request, scope, { limit: 1, windowMs: 60_000 }).allowed).toBe(true);
    expect(checkRateLimit(request, scope, { limit: 1, windowMs: 60_000 })).toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it('prevents concurrent work for the same operation key', () => {
    const scope = randomUUID();
    const release = acquireOperationLock(scope, 'device-auth-id');

    expect(release).toBeTypeOf('function');
    expect(acquireOperationLock(scope, 'device-auth-id')).toBeNull();
    release?.();
    const releaseAgain = acquireOperationLock(scope, 'device-auth-id');
    expect(releaseAgain).toBeTypeOf('function');
    releaseAgain?.();
  });
});
