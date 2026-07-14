import { createChatGPTOAuth } from '@grikomsn/ai-sdk-provider-chatgpt-oauth';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from 'ai';
import { isSameOrigin, noStoreHeaders } from '@/lib/auth/request';
import { requireFreshCredentials, SessionRequiredError } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  let credentials;
  try {
    credentials = await requireFreshCredentials();
  } catch (error) {
    const message =
      error instanceof SessionRequiredError ? error.message : 'Unable to read session.';
    return Response.json({ error: message }, { status: 401, headers: noStoreHeaders });
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
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onError: () => 'ChatGPT could not complete this response. Try again.',
    }),
  });
}
