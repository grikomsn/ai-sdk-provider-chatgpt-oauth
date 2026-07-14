import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  exchangeDeviceCode,
  OAuthRequestError,
  pollDeviceCode,
  requestDeviceCode,
} from './openai-oauth';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAI device OAuth', () => {
  it.each([403, 404])('treats HTTP %s as authorization pending', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));

    await expect(pollDeviceCode('device-id', 'USER-CODE')).resolves.toEqual({
      status: 'pending',
    });
  });

  it('treats other device polling failures as terminal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(pollDeviceCode('device-id', 'USER-CODE')).rejects.toMatchObject({
      name: 'OAuthRequestError',
      statusCode: 401,
    });
  });

  it('combines a caller abort signal with the request timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      expect(init.signal).not.toBe(controller.signal);
      expect(init.signal?.aborted).toBe(true);
      return Promise.resolve(
        Response.json({
          device_auth_id: 'device-id',
          user_code: 'USER-CODE',
          interval: '5',
        })
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await requestDeviceCode(controller.signal);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects zero or negative token lifetimes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          access_token: createJwt({ sub: 'account-id' }),
          id_token: createJwt({ sub: 'account-id' }),
          expires_in: 0,
        })
      )
    );

    await expect(exchangeDeviceCode('authorization-code', 'code-verifier')).rejects.toBeInstanceOf(
      OAuthRequestError
    );
  });
});

function createJwt(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.`;
}
