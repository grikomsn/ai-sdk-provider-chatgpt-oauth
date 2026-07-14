import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockSessionRequiredError extends Error {}

  return {
    SessionRequiredError: MockSessionRequiredError,
    checkRateLimit: vi.fn(),
    convertToModelMessages: vi.fn(),
    createChatGPTOAuth: vi.fn(),
    createModel: vi.fn(),
    createUIMessageStreamResponse: vi.fn(),
    fetchChatGPTModelCatalog: vi.fn(),
    isSameOrigin: vi.fn(),
    requireFreshCredentials: vi.fn(),
    streamText: vi.fn(),
    toUIMessageStream: vi.fn(),
    validateUIMessages: vi.fn(),
  };
});

vi.mock('@grikomsn/ai-sdk-provider-chatgpt-oauth', () => ({
  createChatGPTOAuth: mocks.createChatGPTOAuth,
}));
vi.mock('ai', () => ({
  convertToModelMessages: mocks.convertToModelMessages,
  createUIMessageStreamResponse: mocks.createUIMessageStreamResponse,
  streamText: mocks.streamText,
  toUIMessageStream: mocks.toUIMessageStream,
  validateUIMessages: mocks.validateUIMessages,
}));
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
vi.mock('@/lib/chatgpt-models.server', () => ({
  fetchChatGPTModelCatalog: mocks.fetchChatGPTModelCatalog,
}));

import { POST } from './route';

const credentials = {
  accessToken: 'access-token',
  accountId: 'account-id',
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.checkRateLimit.mockReset().mockReturnValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.convertToModelMessages.mockReset().mockImplementation(async (messages) => messages);
  mocks.createChatGPTOAuth.mockReset().mockReturnValue(mocks.createModel);
  mocks.createModel.mockReset().mockReturnValue({ modelId: 'selected-model' });
  mocks.createUIMessageStreamResponse
    .mockReset()
    .mockImplementation(({ headers }) => new Response(null, { headers }));
  mocks.fetchChatGPTModelCatalog.mockReset().mockResolvedValue(createCatalog());
  mocks.isSameOrigin.mockReset().mockReturnValue(true);
  mocks.requireFreshCredentials.mockReset().mockResolvedValue(credentials);
  mocks.streamText.mockReset().mockReturnValue({ stream: new ReadableStream<Uint8Array>() });
  mocks.toUIMessageStream.mockReset().mockImplementation(({ stream }) => stream);
  mocks.validateUIMessages.mockReset().mockImplementation(async ({ messages }) => {
    if (!Array.isArray(messages)) {
      throw new TypeError('Invalid messages');
    }
    return messages;
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

  it('passes request cancellation to credential refresh', async () => {
    const request = createRequest();

    await POST(request);

    expect(mocks.requireFreshCredentials).toHaveBeenCalledWith(request.signal);
  });

  it('uses GPT-5.6 Luna and its default effort when no selection is provided', async () => {
    const request = createRequest(validChatBody());

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.fetchChatGPTModelCatalog).toHaveBeenCalledWith(credentials, request.signal);
    expect(mocks.createModel).toHaveBeenCalledWith('gpt-5.6-luna', {
      instructions: 'Luna instructions',
      reasoningEffort: 'medium',
    });
    expect(mocks.streamText).toHaveBeenCalledOnce();
  });

  it('accepts a model-specific maximum effort from the live catalog', async () => {
    const response = await POST(
      createRequest(
        validChatBody({
          modelId: 'gpt-5.6-sol',
          reasoningEffort: 'max',
        })
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.createModel).toHaveBeenCalledWith('gpt-5.6-sol', {
      instructions: 'Sol instructions',
      reasoningEffort: 'max',
    });
  });

  it('rejects a model that is not available to the account', async () => {
    const response = await POST(
      createRequest(validChatBody({ modelId: 'not-available', reasoningEffort: 'medium' }))
    );

    expect(response.status).toBe(400);
    expect(mocks.createModel).not.toHaveBeenCalled();
  });

  it('rejects an effort that the selected model does not support', async () => {
    const response = await POST(
      createRequest(
        validChatBody({
          modelId: 'gpt-5.6-luna',
          reasoningEffort: 'ultra',
        })
      )
    );

    expect(response.status).toBe(400);
    expect(mocks.createModel).not.toHaveBeenCalled();
  });

  it('returns a retryable error when account model discovery fails', async () => {
    mocks.fetchChatGPTModelCatalog.mockRejectedValue(new Error('catalog unavailable'));

    const response = await POST(createRequest(validChatBody()));

    expect(response.status).toBe(502);
    expect(mocks.createModel).not.toHaveBeenCalled();
  });
});

function createRequest(body?: object): Request {
  return new Request('https://chat.example.com/api/chat', {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
  });
}

function validChatBody(overrides: Record<string, unknown> = {}) {
  return {
    messages: [
      {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
      },
    ],
    ...overrides,
  };
}

function createCatalog() {
  return {
    defaultModelId: 'gpt-5.6-luna',
    models: [
      {
        id: 'gpt-5.6-luna',
        name: 'GPT-5.6-Luna',
        description: 'Fast',
        baseInstructions: 'Luna instructions',
        defaultReasoningEffort: 'medium',
        reasoningEfforts: [
          { id: 'low', label: 'Low', description: 'Faster' },
          { id: 'medium', label: 'Medium', description: 'Balanced' },
          { id: 'max', label: 'Max', description: 'Deepest' },
        ],
      },
      {
        id: 'gpt-5.6-sol',
        name: 'GPT-5.6-Sol',
        description: 'Frontier',
        baseInstructions: 'Sol instructions',
        defaultReasoningEffort: 'low',
        reasoningEfforts: [
          { id: 'low', label: 'Low', description: 'Faster' },
          { id: 'max', label: 'Max', description: 'Deepest' },
        ],
      },
    ],
  };
}
