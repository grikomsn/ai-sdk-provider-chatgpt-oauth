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
  try {
    const body = (await request.json()) as { messages?: unknown };
    messages = await validateUIMessages<UIMessage>({ messages: body.messages });
  } catch {
    return Response.json(
      { error: 'The chat request is invalid.' },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const chatgpt = createChatGPTOAuth({ credentials, autoRefresh: false });
  const result = streamText({
    model: chatgpt('gpt-5.5'),
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
