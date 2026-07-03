import { NoSuchModelError } from '@ai-sdk/provider';
import { createProviderRegistry } from 'ai';
import { describe, expect, it } from 'vitest';
import { createChatGPTOAuth } from '../chatgpt-oauth-provider';

describe('createChatGPTOAuth', () => {
  it('registers as an AI SDK 7 ProviderV4', () => {
    const provider = createChatGPTOAuth();
    const registry = createProviderRegistry({ chatgpt: provider });

    const model = registry.languageModel('chatgpt:gpt-5.5');

    expect(model.specificationVersion).toBe('v4');
    expect(model.modelId).toBe('gpt-5.5');
  });

  it.each([
    ['embeddingModel', 'text-embedding-3-small'],
    ['imageModel', 'gpt-image-1'],
  ] as const)('rejects unsupported %s requests with NoSuchModelError', (method, modelId) => {
    const provider = createChatGPTOAuth();

    expect(() => provider[method](modelId)).toThrowError(
      expect.objectContaining({
        name: 'AI_NoSuchModelError',
        modelId,
        modelType: method,
      })
    );

    try {
      provider[method](modelId);
    } catch (error) {
      expect(NoSuchModelError.isInstance(error)).toBe(true);
    }
  });
});
