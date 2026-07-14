import { exchangeDeviceCode, pollDeviceCode } from '@/lib/auth/openai-oauth';
import { isSameOrigin, noStoreHeaders } from '@/lib/auth/request';
import { clearDeviceFlow, readDeviceFlow, writeAuthSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  const flow = await readDeviceFlow();
  if (!flow) {
    return Response.json(
      { error: 'No device authorization is in progress.' },
      { status: 401, headers: noStoreHeaders }
    );
  }

  if (flow.expiresAt <= Date.now()) {
    await clearDeviceFlow();
    return Response.json(
      { error: 'The device code expired. Start again.' },
      { status: 410, headers: noStoreHeaders }
    );
  }

  try {
    const result = await pollDeviceCode(flow.deviceAuthId, flow.userCode);
    if (result.status === 'pending') {
      return Response.json({ status: 'pending' }, { status: 202, headers: noStoreHeaders });
    }

    const credentials = await exchangeDeviceCode(result.authorizationCode, result.codeVerifier);
    await writeAuthSession(credentials);
    await clearDeviceFlow();
    return Response.json({ status: 'authenticated' }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Unable to complete ChatGPT device authorization.', error);
    await clearDeviceFlow();
    return Response.json(
      { error: 'ChatGPT authorization failed. Start again.' },
      { status: 502, headers: noStoreHeaders }
    );
  }
}
