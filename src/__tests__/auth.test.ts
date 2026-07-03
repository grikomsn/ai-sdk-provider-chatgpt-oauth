import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatGPTOAuthError } from '../chatgpt-oauth-error';

vi.mock('../auth/token-refresh', () => ({
  refreshAccessToken: vi.fn(),
}));

import { extractTokenExpiry, loadCredentialsFromFile } from '../auth/credentials-loader';
import { DefaultAuthProvider, extractAccountIdFromToken } from '../auth';
import { refreshAccessToken } from '../auth/token-refresh';

const mockedRefreshAccessToken = vi.mocked(refreshAccessToken);
const temporaryDirectories: string[] = [];

afterEach(() => {
  mockedRefreshAccessToken.mockReset();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('authentication', () => {
  it('reads expiry and the current nested ChatGPT account claim from JWTs', () => {
    const expirySeconds = 1_800_000_000;
    const token = createJwt({
      exp: expirySeconds,
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'account-from-current-claim',
      },
    });

    expect(extractTokenExpiry(token)).toBe(expirySeconds * 1000);
    expect(extractAccountIdFromToken(token)).toBe('account-from-current-claim');
  });

  it('loads Codex credentials without guessing an expiry from last_refresh', () => {
    const directory = mkdtempSync(join(tmpdir(), 'chatgpt-oauth-auth-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'auth.json');
    const expirySeconds = 1_800_000_000;

    writeFileSync(
      path,
      JSON.stringify({
        tokens: {
          access_token: createJwt({ exp: expirySeconds }),
          refresh_token: 'refresh-token',
          id_token: createJwt({
            'https://api.openai.com/auth': {
              chatgpt_account_id: 'test-account',
            },
          }),
        },
        last_refresh: '2000-01-01T00:00:00.000Z',
      })
    );

    expect(loadCredentialsFromFile(path)).toEqual({
      accessToken: createJwt({ exp: expirySeconds }),
      refreshToken: 'refresh-token',
      accountId: 'test-account',
      expiresAt: expirySeconds * 1000,
    });
  });

  it('deduplicates concurrent refreshes', async () => {
    mockedRefreshAccessToken.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      accountId: 'test-account',
      expiresAt: Date.now() + 60_000,
    });
    const provider = new DefaultAuthProvider({
      credentials: {
        accessToken: 'expired-access-token',
        refreshToken: 'refresh-token',
        accountId: 'test-account',
        expiresAt: Date.now() - 1,
      },
    });

    const [first, second] = await Promise.all([
      provider.getCredentials(),
      provider.getCredentials(),
    ]);

    expect(first.accessToken).toBe('new-access-token');
    expect(second.accessToken).toBe('new-access-token');
    expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('clears a failed refresh so a later call can retry', async () => {
    mockedRefreshAccessToken
      .mockRejectedValueOnce(new ChatGPTOAuthError('Refresh rejected', 'TOKEN_REFRESH_FAILED', 401))
      .mockResolvedValueOnce({
        accessToken: 'recovered-access-token',
        refreshToken: 'refresh-token',
        accountId: 'test-account',
        expiresAt: Date.now() + 60_000,
      });
    const provider = new DefaultAuthProvider({
      credentials: {
        accessToken: 'expired-access-token',
        refreshToken: 'refresh-token',
        accountId: 'test-account',
        expiresAt: Date.now() - 1,
      },
    });

    await expect(provider.getCredentials()).rejects.toMatchObject({
      code: 'TOKEN_REFRESH_FAILED',
    });
    await expect(provider.getCredentials()).resolves.toMatchObject({
      accessToken: 'recovered-access-token',
    });
    expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(2);
  });
});

function createJwt(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encodedPayload}.signature`;
}
