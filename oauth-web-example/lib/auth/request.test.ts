import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSameOrigin } from './request';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isSameOrigin', () => {
  it('compares against the request URL without proxy trust', () => {
    const request = new Request('http://localhost:3000/api/chat', {
      headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it('ignores spoofed forwarded headers by default', () => {
    const request = new Request('https://chat.example.com/api/chat', {
      headers: {
        origin: 'https://attacker.example',
        'x-forwarded-host': 'attacker.example',
        'x-forwarded-proto': 'https',
      },
    });

    expect(isSameOrigin(request)).toBe(false);
  });

  it('uses the proxy-adjacent forwarded origin when proxy trust is explicit', () => {
    vi.stubEnv('TRUST_PROXY', 'true');
    const request = new Request('http://internal:3000/api/chat', {
      headers: {
        host: 'internal:3000',
        origin: 'https://chat.example.com',
        'x-forwarded-host': 'spoofed.example, chat.example.com',
        'x-forwarded-proto': 'http, https',
      },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it('prefers a configured canonical origin', () => {
    vi.stubEnv('APP_ORIGIN', 'https://chat.example.com');
    const request = new Request('http://internal:3000/api/chat', {
      headers: { origin: 'https://chat.example.com' },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it('rejects a different, malformed, or missing origin', () => {
    expect(
      isSameOrigin(
        new Request('https://chat.example.com/api/chat', {
          headers: { origin: 'https://attacker.example' },
        })
      )
    ).toBe(false);
    expect(
      isSameOrigin(
        new Request('https://chat.example.com/api/chat', {
          headers: { origin: 'null' },
        })
      )
    ).toBe(false);
    expect(isSameOrigin(new Request('https://chat.example.com/api/chat'))).toBe(false);
  });
});
