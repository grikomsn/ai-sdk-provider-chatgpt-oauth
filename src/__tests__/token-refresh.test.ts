import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshAccessToken } from '../auth/token-refresh';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('refreshAccessToken', () => {
  it('refreshes credentials and preserves a rotated-or-omitted refresh token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        access_token: 'new-access-token',
        expires_in: 3600,
        id_token: 'new-id-token',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await expect(refreshAccessToken('existing-refresh-token', 'test-account')).resolves.toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'existing-refresh-token',
      accountId: 'test-account',
      expiresAt: 4_600_000,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('refresh_token=existing-refresh-token');
  });

  it('returns a typed error when the authorization server rejects refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 401,
          statusText: 'Unauthorized',
        })
      )
    );

    await expect(refreshAccessToken('invalid-refresh-token', 'test-account')).rejects.toMatchObject(
      {
        name: 'ChatGPTOAuthError',
        code: 'TOKEN_REFRESH_FAILED',
        statusCode: 401,
      }
    );
  });
});
