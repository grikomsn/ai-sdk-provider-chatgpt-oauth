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

  class MockSessionCookieTooLargeError extends Error {}

  return {
    OAuthRequestError: MockOAuthRequestError,
    SessionCookieTooLargeError: MockSessionCookieTooLargeError,
    acquireOperationLock: vi.fn(),
    checkRateLimit: vi.fn(),
    clearDeviceFlow: vi.fn(),
    exchangeDeviceCode: vi.fn(),
    isSameOrigin: vi.fn(),
    pollDeviceCode: vi.fn(),
    readDeviceFlow: vi.fn(),
    releasePollLock: vi.fn(),
    writeAuthSession: vi.fn(),
    writeDeviceFlow: vi.fn(),
  };
});

vi.mock('@/lib/auth/openai-oauth', () => ({
  exchangeDeviceCode: mocks.exchangeDeviceCode,
  OAuthRequestError: mocks.OAuthRequestError,
  pollDeviceCode: mocks.pollDeviceCode,
}));
vi.mock('@/lib/auth/rate-limit', () => ({
  acquireOperationLock: mocks.acquireOperationLock,
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
  clearDeviceFlow: mocks.clearDeviceFlow,
  readDeviceFlow: mocks.readDeviceFlow,
  SessionCookieTooLargeError: mocks.SessionCookieTooLargeError,
  writeAuthSession: mocks.writeAuthSession,
  writeDeviceFlow: mocks.writeDeviceFlow,
}));

import { POST } from './route';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.acquireOperationLock.mockReturnValue(mocks.releasePollLock);
  mocks.checkRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.clearDeviceFlow.mockReset().mockResolvedValue(undefined);
  mocks.exchangeDeviceCode.mockReset().mockResolvedValue({
    accessToken: 'access-token',
    accountId: 'account-id',
  });
  mocks.isSameOrigin.mockReset().mockReturnValue(true);
  mocks.pollDeviceCode.mockReset().mockResolvedValue({ status: 'pending' });
  mocks.readDeviceFlow.mockReset().mockResolvedValue({
    deviceAuthId: 'device-id',
    userCode: 'USER-CODE',
    interval: 5,
    expiresAt: Date.now() + 60_000,
  });
  mocks.releasePollLock.mockReset();
  mocks.writeAuthSession.mockReset().mockResolvedValue(undefined);
  mocks.writeDeviceFlow.mockReset().mockResolvedValue(undefined);
});

describe('device poll route', () => {
  it('preserves the device flow when the request is aborted', async () => {
    mocks.pollDeviceCode.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    const controller = new AbortController();
    controller.abort();

    const response = await POST(createRequest(controller.signal));

    expect(response.status).toBe(202);
    expect(mocks.clearDeviceFlow).not.toHaveBeenCalled();
  });

  it('preserves the device flow on a transient upstream failure', async () => {
    mocks.pollDeviceCode.mockRejectedValue(new Error('network unavailable'));

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
    expect(mocks.clearDeviceFlow).not.toHaveBeenCalled();
  });

  it('persists a longer polling interval after slow_down', async () => {
    mocks.pollDeviceCode.mockResolvedValue({
      status: 'pending',
      slowDown: true,
      interval: 8,
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(202);
    expect(response.headers.get('retry-after')).toBe('10');
    expect(mocks.writeDeviceFlow).toHaveBeenCalledWith(expect.objectContaining({ interval: 10 }));
  });

  it('clears the flow after a terminal OAuth rejection', async () => {
    mocks.pollDeviceCode.mockRejectedValue(new mocks.OAuthRequestError('denied', 401));

    const response = await POST(createRequest());

    expect(response.status).toBe(502);
    expect(mocks.clearDeviceFlow).toHaveBeenCalledOnce();
  });

  it('maps an oversized session cookie to an actionable response', async () => {
    mocks.pollDeviceCode.mockResolvedValue({
      status: 'complete',
      authorizationCode: 'authorization-code',
      codeVerifier: 'code-verifier',
    });
    mocks.writeAuthSession.mockRejectedValue(new mocks.SessionCookieTooLargeError());

    const response = await POST(createRequest());

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'The ChatGPT session is too large for this cookie-based demo.',
    });
    expect(mocks.clearDeviceFlow).toHaveBeenCalledOnce();
  });

  it('clears a consumed device flow after a successful exchange', async () => {
    mocks.pollDeviceCode.mockResolvedValue({
      status: 'complete',
      authorizationCode: 'authorization-code',
      codeVerifier: 'code-verifier',
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.writeAuthSession).toHaveBeenCalledOnce();
    expect(mocks.clearDeviceFlow).toHaveBeenCalledOnce();
  });

  it('does not report pending after exchange has consumed the device code', async () => {
    mocks.pollDeviceCode.mockResolvedValue({
      status: 'complete',
      authorizationCode: 'authorization-code',
      codeVerifier: 'code-verifier',
    });
    mocks.writeAuthSession.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    const controller = new AbortController();
    controller.abort();

    const response = await POST(createRequest(controller.signal));

    expect(response.status).toBe(502);
    expect(mocks.clearDeviceFlow).toHaveBeenCalledOnce();
  });
});

function createRequest(signal?: AbortSignal): Request {
  return new Request('https://chat.example.com/api/auth/device/poll', {
    method: 'POST',
    signal,
  });
}
