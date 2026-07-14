import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockSessionRequiredError extends Error {}

  return {
    SessionRequiredError: MockSessionRequiredError,
    checkRateLimit: vi.fn(),
    isSameOrigin: vi.fn(),
    requireFreshCredentials: vi.fn(),
  };
});

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock('@/lib/auth/request', () => ({
  isSameOrigin: mocks.isSameOrigin,
  noStoreHeaders: { 'Cache-Control': 'no-store' },
  noStoreHeadersWith: (headers: Record<string, string>) => ({
    'Cache-Control': 'no-store',
    ...headers,
  }),
}));
vi.mock('@/lib/auth/session', () => ({
  requireFreshCredentials: mocks.requireFreshCredentials,
  SessionRequiredError: mocks.SessionRequiredError,
}));

import { POST } from './route';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.checkRateLimit.mockReset().mockReturnValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.isSameOrigin.mockReset().mockReturnValue(true);
  mocks.requireFreshCredentials.mockReset().mockResolvedValue({
    accessToken: 'access-token',
    accountId: 'account-id',
  });
});

describe('chat route guards', () => {
  it('rejects cross-origin requests', async () => {
    mocks.isSameOrigin.mockReturnValue(false);

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mocks.requireFreshCredentials).not.toHaveBeenCalled();
  });

  it('rate-limits chat before reading credentials', async () => {
    mocks.checkRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 12 });

    const response = await POST(createRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('12');
    expect(mocks.requireFreshCredentials).not.toHaveBeenCalled();
  });

  it('returns 401 for a permanently invalid session', async () => {
    mocks.requireFreshCredentials.mockRejectedValue(
      new mocks.SessionRequiredError('Sign in again.')
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
  });

  it('returns a retryable upstream error without signing the user out', async () => {
    mocks.requireFreshCredentials.mockRejectedValue(new Error('upstream unavailable'));

    const response = await POST(createRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'ChatGPT is temporarily unavailable. Try again.',
    });
  });
});

function createRequest(): Request {
  return new Request('https://chat.example.com/api/chat', {
    method: 'POST',
  });
}
