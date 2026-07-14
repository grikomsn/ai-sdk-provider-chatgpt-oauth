import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockOAuthRequestError extends Error {
    constructor(
      message: string,
      readonly statusCode?: number
    ) {
      super(message);
      this.name = 'OAuthRequestError';
    }
  }

  return {
    OAuthRequestError: MockOAuthRequestError,
    refreshCredentials: vi.fn(),
    options: new Map<string, Record<string, unknown>>(),
    values: new Map<string, string>(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = mocks.values.get(name);
      return value ? { value } : undefined;
    },
    set: (name: string, value: string, options: Record<string, unknown>) => {
      mocks.options.set(name, options);
      if (value) {
        mocks.values.set(name, value);
      } else {
        mocks.values.delete(name);
      }
    },
  })),
}));
vi.mock('./openai-oauth', () => ({
  OAuthRequestError: mocks.OAuthRequestError,
  refreshCredentials: mocks.refreshCredentials,
}));

import {
  readAuthSession,
  requireFreshCredentials,
  SessionCookieTooLargeError,
  SessionRequiredError,
  writeAuthSession,
} from './session';

const SESSION_COOKIE = 'chatgpt_oauth_session';

beforeEach(() => {
  process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  delete process.env.ALLOW_INSECURE_COOKIES;
  mocks.options.clear();
  mocks.values.clear();
  mocks.refreshCredentials.mockReset();
});

describe('OAuth sessions', () => {
  it('round-trips encrypted credentials and rejects tampering or v1 cookies', async () => {
    const credentials = {
      accessToken: 'access-token',
      accountId: 'account-id',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
    };
    await writeAuthSession(credentials);

    await expect(readAuthSession()).resolves.toEqual(credentials);
    const encrypted = mocks.values.get(SESSION_COOKIE) as string;
    const parts = encrypted.split('.');
    parts[3] = `${parts[3]?.startsWith('A') ? 'B' : 'A'}${parts[3]?.slice(1)}`;
    mocks.values.set(SESSION_COOKIE, parts.join('.'));
    await expect(readAuthSession()).resolves.toBeNull();
    mocks.values.set(SESSION_COOKIE, encrypted.replace(/^v2\./, 'v1.'));
    await expect(readAuthSession()).resolves.toBeNull();
  });

  it('uses secure cookies unless local HTTP is explicitly enabled', async () => {
    await writeAuthSession({ accessToken: 'token', accountId: 'account-id' });
    expect(mocks.options.get(SESSION_COOKIE)).toMatchObject({ secure: true });

    process.env.ALLOW_INSECURE_COOKIES = 'true';
    await writeAuthSession({ accessToken: 'token', accountId: 'account-id' });
    expect(mocks.options.get(SESSION_COOKIE)).toMatchObject({ secure: false });
  });

  it('rejects sessions that cannot fit in a cookie', async () => {
    await expect(
      writeAuthSession({ accessToken: 'x'.repeat(4_000), accountId: 'account-id' })
    ).rejects.toBeInstanceOf(SessionCookieTooLargeError);
  });

  it('clears an expired session without a refresh token', async () => {
    await writeAuthSession({
      accessToken: 'expired-token',
      accountId: 'account-id',
      expiresAt: Date.now() - 1,
    });

    await expect(requireFreshCredentials()).rejects.toBeInstanceOf(SessionRequiredError);
    await expect(readAuthSession()).resolves.toBeNull();
  });

  it('coalesces concurrent refreshes for the same token', async () => {
    const staleCredentials = {
      accessToken: 'stale-access-token',
      accountId: 'account-id',
      refreshToken: 'coalesced-refresh-token',
      expiresAt: Date.now() - 1,
    };
    await writeAuthSession(staleCredentials);
    mocks.refreshCredentials.mockResolvedValue({
      accessToken: 'fresh-access-token',
      accountId: 'account-id',
      refreshToken: 'rotated-refresh-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
    });

    const controller = new AbortController();
    const [first, second] = await Promise.all([
      requireFreshCredentials(controller.signal),
      requireFreshCredentials(controller.signal),
    ]);

    // Simulate a request that arrived with the stale cookie just after the first
    // refresh completed but before the response cookie reached the browser.
    await writeAuthSession(staleCredentials);
    const lateCaller = await requireFreshCredentials();

    expect(mocks.refreshCredentials).toHaveBeenCalledOnce();
    expect(mocks.refreshCredentials).toHaveBeenCalledWith(
      'coalesced-refresh-token',
      'account-id',
      controller.signal
    );
    expect(first.accessToken).toBe('fresh-access-token');
    expect(second.accessToken).toBe('fresh-access-token');
    expect(lateCaller.accessToken).toBe('fresh-access-token');
  });

  it('clears the cookie for a permanent refresh rejection', async () => {
    await writeExpiredRefreshableSession('permanent-refresh-token');
    mocks.refreshCredentials.mockRejectedValue(new mocks.OAuthRequestError('invalid grant', 400));

    await expect(requireFreshCredentials()).rejects.toBeInstanceOf(SessionRequiredError);
    await expect(readAuthSession()).resolves.toBeNull();
  });

  it('preserves the cookie when refresh fails transiently', async () => {
    await writeExpiredRefreshableSession('transient-refresh-token');
    const transientError = new mocks.OAuthRequestError('upstream unavailable', 503);
    mocks.refreshCredentials.mockRejectedValue(transientError);

    await expect(requireFreshCredentials()).rejects.toBe(transientError);
    await expect(readAuthSession()).resolves.toMatchObject({ accessToken: 'stale-access-token' });
  });
});

async function writeExpiredRefreshableSession(refreshToken: string): Promise<void> {
  await writeAuthSession({
    accessToken: 'stale-access-token',
    accountId: 'account-id',
    refreshToken,
    expiresAt: Date.now() - 1,
  });
}
