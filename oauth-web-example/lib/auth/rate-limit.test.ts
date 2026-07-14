import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireOperationLock, checkRateLimit } from './rate-limit';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('request guards', () => {
  it('limits repeated requests from the same Vercel client', () => {
    vi.stubEnv('VERCEL', '1');
    const request = new Request('https://chat.example.com/api/auth/device/start', {
      headers: { 'x-vercel-forwarded-for': '192.0.2.1' },
    });
    const scope = randomUUID();

    expect(checkRateLimit(request, scope, { limit: 1, windowMs: 60_000 }).allowed).toBe(true);
    expect(checkRateLimit(request, scope, { limit: 1, windowMs: 60_000 })).toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it('uses the proxy-adjacent address instead of spoofable leading values', () => {
    vi.stubEnv('TRUST_PROXY', 'true');
    const scope = randomUUID();
    const first = new Request('https://chat.example.com/api/chat', {
      headers: { 'x-forwarded-for': '198.51.100.1, 192.0.2.1' },
    });
    const second = new Request('https://chat.example.com/api/chat', {
      headers: { 'x-forwarded-for': '198.51.100.2, 192.0.2.1' },
    });

    expect(checkRateLimit(first, scope, { limit: 1, windowMs: 60_000 }).allowed).toBe(true);
    expect(checkRateLimit(second, scope, { limit: 1, windowMs: 60_000 }).allowed).toBe(false);
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
