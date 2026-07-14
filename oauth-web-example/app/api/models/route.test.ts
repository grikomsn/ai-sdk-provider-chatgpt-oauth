import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockSessionRequiredError extends Error {}

  return {
    SessionRequiredError: MockSessionRequiredError,
    fetchChatGPTModelCatalog: vi.fn(),
    requireFreshCredentials: vi.fn(),
    toChatGPTModelsResponse: vi.fn(),
  };
});

vi.mock('@/lib/auth/request', () => ({
  noStoreHeaders: { 'Cache-Control': 'no-store' },
}));
vi.mock('@/lib/auth/session', () => ({
  requireFreshCredentials: mocks.requireFreshCredentials,
  SessionRequiredError: mocks.SessionRequiredError,
}));
vi.mock('@/lib/chatgpt-models.server', () => ({
  fetchChatGPTModelCatalog: mocks.fetchChatGPTModelCatalog,
  toChatGPTModelsResponse: mocks.toChatGPTModelsResponse,
}));

import { GET } from './route';

const credentials = {
  accessToken: 'access-token',
  accountId: 'account-id',
};
const catalog = {
  defaultModelId: 'gpt-5.6-luna',
  models: [
    {
      id: 'gpt-5.6-luna',
      name: 'GPT-5.6-Luna',
      description: 'Fast',
      baseInstructions: 'private instructions',
      defaultReasoningEffort: 'medium',
      reasoningEfforts: [{ id: 'medium', label: 'Medium', description: 'Balanced' }],
    },
  ],
};
const publicCatalog = {
  defaultModelId: 'gpt-5.6-luna',
  models: [
    {
      id: 'gpt-5.6-luna',
      name: 'GPT-5.6-Luna',
      description: 'Fast',
      defaultReasoningEffort: 'medium',
      reasoningEfforts: [{ id: 'medium', label: 'Medium', description: 'Balanced' }],
    },
  ],
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.fetchChatGPTModelCatalog.mockReset().mockResolvedValue(catalog);
  mocks.requireFreshCredentials.mockReset().mockResolvedValue(credentials);
  mocks.toChatGPTModelsResponse.mockReset().mockReturnValue(publicCatalog);
});

describe('models route', () => {
  it('returns the sanitized account model catalog without caching it', async () => {
    const request = new Request('https://chat.example.com/api/models');

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(publicCatalog);
    expect(mocks.requireFreshCredentials).toHaveBeenCalledWith(request.signal);
    expect(mocks.fetchChatGPTModelCatalog).toHaveBeenCalledWith(credentials, request.signal);
    expect(mocks.toChatGPTModelsResponse).toHaveBeenCalledWith(catalog);
  });

  it('returns 401 when the browser session is no longer valid', async () => {
    mocks.requireFreshCredentials.mockRejectedValue(
      new mocks.SessionRequiredError('Sign in again.')
    );

    const response = await GET(new Request('https://chat.example.com/api/models'));

    expect(response.status).toBe(401);
    expect(mocks.fetchChatGPTModelCatalog).not.toHaveBeenCalled();
  });

  it('maps catalog failures to a retryable upstream error', async () => {
    mocks.fetchChatGPTModelCatalog.mockRejectedValue(new Error('upstream unavailable'));

    const response = await GET(new Request('https://chat.example.com/api/models'));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'Unable to load the available ChatGPT models. Try again.',
    });
  });
});
