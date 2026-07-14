import { noStoreHeaders } from '@/lib/auth/request';
import { requireFreshCredentials, SessionRequiredError } from '@/lib/auth/session';
import { fetchChatGPTModelCatalog, toChatGPTModelsResponse } from '@/lib/chatgpt-models.server';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
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

  try {
    const catalog = await fetchChatGPTModelCatalog(credentials, request.signal);
    return Response.json(toChatGPTModelsResponse(catalog), { headers: noStoreHeaders });
  } catch (error) {
    console.error('Unable to load the ChatGPT model catalog.', error);
    return Response.json(
      { error: 'Unable to load the available ChatGPT models. Try again.' },
      { status: 502, headers: noStoreHeaders }
    );
  }
}
