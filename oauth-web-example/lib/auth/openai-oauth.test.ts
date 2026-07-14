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

  it('treats a structured authorization_pending response as pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'authorization_pending' }, { status: 400 }))
    );

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

  it('uses provider-supplied device metadata when available', async () => {
    const startedAt = Date.now();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          device_auth_id: 'device-id',
          user_code: 'USER-CODE',
          interval: '7',
          expires_in: '600',
          verification_uri: 'https://auth.openai.com/custom-device',
        })
      )
    );

    const result = await requestDeviceCode();
    expect(result).toMatchObject({
      deviceAuthId: 'device-id',
      userCode: 'USER-CODE',
      interval: 7,
      verificationUrl: 'https://auth.openai.com/custom-device',
    });
    expect(result.expiresAt).toBeGreaterThanOrEqual(startedAt + 600_000);
  });

  it('accepts a numeric string token lifetime', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          access_token: createJwt({ sub: 'account-id' }),
          id_token: createJwt({ sub: 'account-id' }),
          expires_in: '3600',
        })
      )
    );

    const credentials = await exchangeDeviceCode('authorization-code', 'code-verifier');
    expect(credentials.expiresAt).toBeGreaterThan(Date.now() + 3_500_000);
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
