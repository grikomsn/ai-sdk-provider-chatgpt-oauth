import { exchangeDeviceCode, pollDeviceCode } from '@/lib/auth/openai-oauth';
import { acquireOperationLock, checkRateLimit } from '@/lib/auth/rate-limit';
import { isSameOrigin, noStoreHeaders, noStoreHeadersWith } from '@/lib/auth/request';
import { clearDeviceFlow, readDeviceFlow, writeAuthSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: 'Cross-origin request rejected.' },
      { status: 403, headers: noStoreHeaders }
    );
  }

  const rateLimit = checkRateLimit(request, 'device-poll', { limit: 65, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'The authorization status is being checked too frequently.' },
      {
        status: 429,
        headers: noStoreHeadersWith({ 'Retry-After': String(rateLimit.retryAfterSeconds) }),
      }
    );
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

  const releasePollLock = acquireOperationLock('device-poll', flow.deviceAuthId);
  if (!releasePollLock) {
    return Response.json(
      { status: 'pending' },
      { status: 202, headers: noStoreHeadersWith({ 'Retry-After': String(flow.interval) }) }
    );
  }

  try {
    const result = await pollDeviceCode(flow.deviceAuthId, flow.userCode, request.signal);
    if (result.status === 'pending') {
      return Response.json({ status: 'pending' }, { status: 202, headers: noStoreHeaders });
    }

    const credentials = await exchangeDeviceCode(
      result.authorizationCode,
      result.codeVerifier,
      request.signal
    );
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
  } finally {
    releasePollLock();
  }
}
