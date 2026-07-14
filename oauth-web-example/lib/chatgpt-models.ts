export const DEFAULT_CHATGPT_MODEL_ID = 'gpt-5.6-luna';

export interface ChatGPTReasoningEffortOption {
  id: string;
  label: string;
  description: string;
}

export interface ChatGPTModelOption {
  id: string;
  name: string;
  description: string;
  defaultReasoningEffort: string | null;
  reasoningEfforts: ChatGPTReasoningEffortOption[];
}

export interface ChatGPTModelsResponse {
  models: ChatGPTModelOption[];
  defaultModelId: string;
}

export function isChatGPTModelsResponse(value: unknown): value is ChatGPTModelsResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const response = value as Partial<ChatGPTModelsResponse>;
  if (!Array.isArray(response.models) || typeof response.defaultModelId !== 'string') {
    return false;
  }

  const validModels = response.models.every((model) => {
    if (
      !model ||
      typeof model.id !== 'string' ||
      typeof model.name !== 'string' ||
      typeof model.description !== 'string' ||
      !Array.isArray(model.reasoningEfforts)
    ) {
      return false;
    }

    const validEfforts = model.reasoningEfforts.every(
      (effort) =>
        effort &&
        typeof effort.id === 'string' &&
        typeof effort.label === 'string' &&
        typeof effort.description === 'string'
    );
    const validDefault =
      model.defaultReasoningEffort === null ||
      (typeof model.defaultReasoningEffort === 'string' &&
        model.reasoningEfforts.some(({ id }) => id === model.defaultReasoningEffort));

    return validEfforts && validDefault;
  });

  return (
    validModels &&
    response.models.length > 0 &&
    response.models.some(({ id }) => id === response.defaultModelId)
  );
}
