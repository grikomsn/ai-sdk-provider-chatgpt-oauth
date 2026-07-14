import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  ChatGPTModelCatalogError,
  fetchChatGPTModelCatalog,
  toChatGPTModelsResponse,
} from './chatgpt-models.server';
import { isChatGPTModelsResponse } from './chatgpt-models';

const credentials = {
  accessToken: 'access-token',
  accountId: 'account-id',
};

describe('ChatGPT model catalog', () => {
  it('returns every listed usable model and defaults to GPT-5.6 Luna', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        models: [
          rawModel({
            slug: 'gpt-5.6-sol',
            display_name: 'GPT-5.6-Sol',
            default_reasoning_level: 'low',
            supported_reasoning_levels: [
              { effort: 'low', description: 'Faster' },
              { effort: 'max', description: 'Deepest direct reasoning' },
              { effort: 'ultra', description: 'Deepest' },
            ],
          }),
          rawModel({
            slug: 'gpt-5.6-luna',
            display_name: 'GPT-5.6-Luna',
            default_reasoning_level: 'medium',
            supported_reasoning_levels: [
              { effort: 'medium', description: 'Balanced' },
              { effort: 'max', description: 'Deepest' },
            ],
          }),
          rawModel({ slug: 'hidden-model', visibility: 'hide' }),
          rawModel({ slug: 'missing-instructions', base_instructions: undefined }),
        ],
      })
    );

    const catalog = await fetchChatGPTModelCatalog(credentials, controller.signal, fetchMock);

    expect(catalog.defaultModelId).toBe('gpt-5.6-luna');
    expect(catalog.models.map(({ id }) => id)).toEqual(['gpt-5.6-sol', 'gpt-5.6-luna']);
    expect(catalog.models[0].reasoningEfforts).toEqual([
      { id: 'low', label: 'Low', description: 'Faster' },
      { id: 'max', label: 'Max', description: 'Deepest direct reasoning' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/codex/models?client_version=2.0.0',
      expect.objectContaining({
        cache: 'no-store',
        signal: controller.signal,
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'chatgpt-account-id': 'account-id',
        }),
      })
    );

    const publicCatalog = toChatGPTModelsResponse(catalog);
    expect(isChatGPTModelsResponse(publicCatalog)).toBe(true);
    expect(JSON.stringify(publicCatalog)).not.toContain('baseInstructions');
    expect(JSON.stringify(publicCatalog)).not.toContain('Instructions for');
  });

  it('uses the first usable model when Luna is not available', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ models: [rawModel({ slug: 'gpt-5.5' })] }));

    const catalog = await fetchChatGPTModelCatalog(credentials, undefined, fetchMock);

    expect(catalog.defaultModelId).toBe('gpt-5.5');
  });

  it('rejects an empty or unusable catalog', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ models: [] }));

    await expect(
      fetchChatGPTModelCatalog(credentials, undefined, fetchMock)
    ).rejects.toBeInstanceOf(ChatGPTModelCatalogError);
  });

  it('preserves the upstream status without including its response body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('sensitive', { status: 403 }));

    await expect(fetchChatGPTModelCatalog(credentials, undefined, fetchMock)).rejects.toMatchObject(
      { statusCode: 403 }
    );
  });
});

function rawModel(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'gpt-5.5',
    display_name: 'GPT-5.5',
    description: 'A model',
    visibility: 'list',
    base_instructions: `Instructions for ${String(overrides.slug ?? 'gpt-5.5')}`,
    default_reasoning_level: 'medium',
    supported_reasoning_levels: [{ effort: 'medium', description: 'Balanced' }],
    ...overrides,
  };
}
