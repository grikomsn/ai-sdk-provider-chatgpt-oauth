import {
  NoSuchModelError,
  type EmbeddingModelV4,
  type ImageModelV4,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { ChatGPTOAuthLanguageModel } from './chatgpt-oauth-language-model';
import type {
  ChatGPTOAuthModelId,
  ChatGPTOAuthCredentials,
  ReasoningEffort,
  ReasoningSummary,
} from './chatgpt-oauth-settings';
import type { AuthProvider } from './auth';
import { DefaultAuthProvider } from './auth';

export interface ChatGPTOAuthProvider extends ProviderV4 {
  (modelId: ChatGPTOAuthModelId, options?: ChatGPTOAuthModelOptions): LanguageModelV4;
  languageModel(modelId: ChatGPTOAuthModelId, options?: ChatGPTOAuthModelOptions): LanguageModelV4;
  chat(modelId: ChatGPTOAuthModelId, options?: ChatGPTOAuthModelOptions): LanguageModelV4;
}

export interface ChatGPTOAuthModelOptions {
  reasoningEffort?: ReasoningEffort | null; // null to explicitly disable
  reasoningSummary?: ReasoningSummary | null; // null to explicitly disable
  instructions?: string;
}

export interface ChatGPTOAuthProviderSettings {
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;

  credentials?: ChatGPTOAuthCredentials;
  credentialsPath?: string;
  authProvider?: AuthProvider;
  autoRefresh?: boolean;

  // Default reasoning settings (defaults to 'medium' and 'auto' like Codex CLI)
  reasoningEffort?: ReasoningEffort | null; // null to disable, undefined for default
  reasoningSummary?: ReasoningSummary | null; // null to disable, undefined for default
  instructions?: string;
}

export function createChatGPTOAuth(
  options: ChatGPTOAuthProviderSettings = {}
): ChatGPTOAuthProvider {
  const baseURL = options.baseURL ?? 'https://chatgpt.com/backend-api';

  const authProvider =
    options.authProvider ??
    new DefaultAuthProvider({
      credentials: options.credentials,
      credentialsPath: options.credentialsPath,
      autoRefresh: options.autoRefresh,
    });

  const createModel = (
    modelId: ChatGPTOAuthModelId,
    modelOptions?: ChatGPTOAuthModelOptions
  ): LanguageModelV4 => {
    return new ChatGPTOAuthLanguageModel(modelId, {
      provider: 'chatgpt-oauth',
      baseURL,
      headers: options.headers ?? {},
      fetch: options.fetch,
      authProvider,
      reasoningEffort: modelOptions?.reasoningEffort ?? options.reasoningEffort,
      reasoningSummary: modelOptions?.reasoningSummary ?? options.reasoningSummary,
      instructions: modelOptions?.instructions ?? options.instructions,
    });
  };

  const provider = Object.assign(
    (modelId: ChatGPTOAuthModelId, modelOptions?: ChatGPTOAuthModelOptions) =>
      createModel(modelId, modelOptions),
    {
      specificationVersion: 'v4' as const,
      languageModel: (modelId: ChatGPTOAuthModelId, modelOptions?: ChatGPTOAuthModelOptions) =>
        createModel(modelId, modelOptions),
      embeddingModel: (modelId: string): EmbeddingModelV4 => {
        throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
      },
      imageModel: (modelId: string): ImageModelV4 => {
        throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
      },
      chat: (modelId: ChatGPTOAuthModelId, modelOptions?: ChatGPTOAuthModelOptions) =>
        createModel(modelId, modelOptions),
    }
  );

  return provider as ChatGPTOAuthProvider;
}

export const chatgptOAuth = createChatGPTOAuth;
