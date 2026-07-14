import 'server-only';

import { randomUUID } from 'node:crypto';
import type { ChatGPTOAuthCredentials } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';
import {
  DEFAULT_CHATGPT_MODEL_ID,
  type ChatGPTModelOption,
  type ChatGPTModelsResponse,
  type ChatGPTReasoningEffortOption,
} from './chatgpt-models';

const MODEL_CATALOG_URL = 'https://chatgpt.com/backend-api/codex/models?client_version=2.0.0';
const DIRECT_REASONING_EFFORTS = new Set([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

interface ChatGPTModelCatalogEntry extends ChatGPTModelOption {
  baseInstructions: string;
}

export interface ChatGPTModelCatalog {
  models: ChatGPTModelCatalogEntry[];
  defaultModelId: string;
}

interface RawReasoningLevel {
  effort?: unknown;
  description?: unknown;
}

interface RawModel {
  slug?: unknown;
  display_name?: unknown;
  description?: unknown;
  visibility?: unknown;
  base_instructions?: unknown;
  default_reasoning_level?: unknown;
  supported_reasoning_levels?: unknown;
}

export class ChatGPTModelCatalogError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ChatGPTModelCatalogError';
  }
}

export async function fetchChatGPTModelCatalog(
  credentials: ChatGPTOAuthCredentials,
  signal?: AbortSignal,
  fetchImplementation: typeof fetch = globalThis.fetch
): Promise<ChatGPTModelCatalog> {
  const response = await fetchImplementation(MODEL_CATALOG_URL, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${credentials.accessToken}`,
      'chatgpt-account-id': credentials.accountId,
      'OpenAI-Beta': 'responses=experimental',
      originator: 'codex_cli_rs',
      session_id: randomUUID(),
    },
    signal,
  });

  if (!response.ok) {
    throw new ChatGPTModelCatalogError(
      `Unable to load the ChatGPT model catalog (${response.status}).`,
      response.status
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ChatGPTModelCatalogError('ChatGPT returned an invalid model catalog.');
  }

  const rawModels =
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { models?: unknown }).models)
      ? ((payload as { models: RawModel[] }).models ?? [])
      : [];
  const models = rawModels.flatMap((model) => {
    const normalized = normalizeModel(model);
    return normalized ? [normalized] : [];
  });

  if (models.length === 0) {
    throw new ChatGPTModelCatalogError('No usable ChatGPT models are available for this account.');
  }

  return {
    models,
    defaultModelId: models.some(({ id }) => id === DEFAULT_CHATGPT_MODEL_ID)
      ? DEFAULT_CHATGPT_MODEL_ID
      : models[0].id,
  };
}

export function toChatGPTModelsResponse(catalog: ChatGPTModelCatalog): ChatGPTModelsResponse {
  return {
    defaultModelId: catalog.defaultModelId,
    models: catalog.models.map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      defaultReasoningEffort: model.defaultReasoningEffort,
      reasoningEfforts: model.reasoningEfforts,
    })),
  };
}

function normalizeModel(model: RawModel): ChatGPTModelCatalogEntry | null {
  if (
    model.visibility !== 'list' ||
    !isBoundedString(model.slug) ||
    !isInstructions(model.base_instructions)
  ) {
    return null;
  }

  const reasoningEfforts = normalizeReasoningEfforts(model.supported_reasoning_levels);
  const requestedDefault = isBoundedString(model.default_reasoning_level)
    ? model.default_reasoning_level
    : null;
  const defaultReasoningEffort = reasoningEfforts.some(({ id }) => id === requestedDefault)
    ? requestedDefault
    : (reasoningEfforts[0]?.id ?? null);

  return {
    id: model.slug,
    name: isBoundedString(model.display_name) ? model.display_name : model.slug,
    description: typeof model.description === 'string' ? model.description : '',
    baseInstructions: model.base_instructions,
    defaultReasoningEffort,
    reasoningEfforts,
  };
}

function normalizeReasoningEfforts(value: unknown): ChatGPTReasoningEffortOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value.flatMap((level: RawReasoningLevel) => {
    if (
      !isBoundedString(level?.effort) ||
      !DIRECT_REASONING_EFFORTS.has(level.effort) ||
      seen.has(level.effort)
    ) {
      return [];
    }
    seen.add(level.effort);
    return [
      {
        id: level.effort,
        label: reasoningEffortLabel(level.effort),
        description: typeof level.description === 'string' ? level.description : '',
      },
    ];
  });
}

function reasoningEffortLabel(effort: string): string {
  const labels: Record<string, string> = {
    none: 'None',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Extra high',
    max: 'Max',
    ultra: 'Ultra',
  };
  return labels[effort] ?? effort;
}

function isBoundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function isInstructions(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1_000_000;
}
