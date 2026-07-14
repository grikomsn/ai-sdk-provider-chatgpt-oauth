import { describe, expect, it } from 'vitest';
import { isSameOrigin } from './request';

describe('isSameOrigin', () => {
  it('uses the forwarded public origin behind a reverse proxy', () => {
    const request = new Request('http://internal:3000/api/chat', {
      headers: {
        host: 'internal:3000',
        origin: 'https://chat.example.com',
        'x-forwarded-host': 'chat.example.com',
        'x-forwarded-proto': 'https',
      },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it('uses the first value in forwarded header chains', () => {
    const request = new Request('http://internal:3000/api/chat', {
      headers: {
        origin: 'https://chat.example.com',
        'x-forwarded-host': 'chat.example.com, internal:3000',
        'x-forwarded-proto': 'https, http',
      },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it('rejects a different or malformed origin', () => {
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
  });

  it('rejects requests without an Origin header', () => {
    expect(isSameOrigin(new Request('https://chat.example.com/api/chat'))).toBe(false);
  });
});
