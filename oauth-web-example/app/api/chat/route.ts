import { createChatGPTOAuth } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from 'ai';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { isSameOrigin, noStoreHeaders, noStoreHeadersWith } from '@/lib/auth/request';
import { requireFreshCredentials, SessionRequiredError } from '@/lib/auth/session';
import { fetchChatGPTModelCatalog } from '@/lib/chatgpt-models.server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: 'Cross-origin request rejected.' },
      { status: 403, headers: noStoreHeaders }
    );
  }

  const rateLimit = checkRateLimit(request, 'chat', { limit: 20, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Too many chat requests. Try again shortly.' },
      {
        status: 429,
        headers: noStoreHeadersWith({ 'Retry-After': String(rateLimit.retryAfterSeconds) }),
      }
    );
  }

  let credentials;
  try {
    credentials = await requireFreshCredentials(request.signal);
  } catch (error) {
    if (error instanceof SessionRequiredError) {
      return Response.json({ error: error.message }, { status: 401, headers: noStoreHeaders });
    }
    console.error('Unable to refresh the ChatGPT session.', error);
    return Response.json(
      { error: 'ChatGPT is temporarily unavailable. Try again.' },
      { status: 502, headers: noStoreHeaders }
    );
  }

  let messages: UIMessage[];
  let requestedModelId: string | undefined;
  let requestedReasoningEffort: string | null | undefined;
  try {
    const body = (await request.json()) as {
      messages?: unknown;
      modelId?: unknown;
      reasoningEffort?: unknown;
    };
    messages = await validateUIMessages<UIMessage>({ messages: body.messages });
    requestedModelId = optionalString(body.modelId);
    requestedReasoningEffort = optionalNullableString(body.reasoningEffort);
  } catch {
    return Response.json(
      { error: 'The chat request is invalid.' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  let catalog;
  try {
    catalog = await fetchChatGPTModelCatalog(credentials, request.signal);
  } catch (error) {
    console.error('Unable to load the ChatGPT model catalog.', error);
    return Response.json(
      { error: 'Unable to load the available ChatGPT models. Try again.' },
      { status: 502, headers: noStoreHeaders }
    );
  }

  const selectedModelId = requestedModelId ?? catalog.defaultModelId;
  const selectedModel = catalog.models.find(({ id }) => id === selectedModelId);
  if (!selectedModel) {
    return Response.json(
      { error: 'The selected ChatGPT model is not available for this account.' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const selectedReasoningEffort =
    requestedReasoningEffort === undefined
      ? selectedModel.defaultReasoningEffort
      : requestedReasoningEffort;
  const reasoningEffortIsValid =
    selectedModel.reasoningEfforts.length === 0
      ? selectedReasoningEffort === null
      : selectedReasoningEffort !== null &&
        selectedModel.reasoningEfforts.some(({ id }) => id === selectedReasoningEffort);
  if (!reasoningEffortIsValid) {
    return Response.json(
      { error: 'The selected reasoning effort is not supported by this model.' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const chatgpt = createChatGPTOAuth({ credentials, autoRefresh: false });
  // The live catalog can add effort values before the installed provider's type union catches up.
  const modelOptions = {
    reasoningEffort: selectedReasoningEffort,
    instructions: selectedModel.baseInstructions,
  } as unknown as NonNullable<Parameters<typeof chatgpt>[1]>;
  const result = streamText({
    model: chatgpt(selectedModel.id, modelOptions),
    messages: await convertToModelMessages(messages),
    abortSignal: request.signal,
  });

  return createUIMessageStreamResponse({
    headers: noStoreHeaders,
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onError: () => 'ChatGPT could not complete this response. Try again.',
    }),
  });
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw new TypeError('Expected a non-empty string.');
  }
  return value;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }
  return optionalString(value);
}
