import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshCredentials: vi.fn(),
  values: new Map<string, string>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = mocks.values.get(name);
      return value ? { value } : undefined;
    },
    set: (name: string, value: string) => {
      if (value) {
        mocks.values.set(name, value);
      } else {
        mocks.values.delete(name);
      }
    },
  })),
}));
vi.mock('./openai-oauth', () => ({
  refreshCredentials: mocks.refreshCredentials,
}));

import { requireFreshCredentials, writeAuthSession } from './session';

beforeEach(() => {
  process.env.SESSION_SECRET = '0123456789abcdef'.repeat(4);
  mocks.values.clear();
  mocks.refreshCredentials.mockReset();
});

describe('OAuth session refresh', () => {
  it('coalesces concurrent refreshes for the same token', async () => {
    await writeAuthSession({
      accessToken: 'stale-access-token',
      accountId: 'account-id',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1,
    });
    mocks.refreshCredentials.mockResolvedValue({
      accessToken: 'fresh-access-token',
      accountId: 'account-id',
      refreshToken: 'rotated-refresh-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
    });

    const [first, second] = await Promise.all([
      requireFreshCredentials(),
      requireFreshCredentials(),
    ]);

    expect(mocks.refreshCredentials).toHaveBeenCalledOnce();
    expect(first.accessToken).toBe('fresh-access-token');
    expect(second.accessToken).toBe('fresh-access-token');
  });
});
