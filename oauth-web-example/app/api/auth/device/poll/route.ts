import { exchangeDeviceCode, OAuthRequestError, pollDeviceCode } from '@/lib/auth/openai-oauth';
import { acquireOperationLock, checkRateLimit } from '@/lib/auth/rate-limit';
import { isSameOrigin, noStoreHeaders, noStoreHeadersWith } from '@/lib/auth/request';
import {
  clearDeviceFlow,
  readDeviceFlow,
  SessionCookieTooLargeError,
  writeAuthSession,
  writeDeviceFlow,
} from '@/lib/auth/session';

export const runtime = 'nodejs';

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isTransientOAuthError(error: unknown): boolean {
  return (
    !(error instanceof OAuthRequestError) ||
    error.statusCode === undefined ||
    error.statusCode === 429 ||
    error.statusCode >= 500
  );
}

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

  let deviceCodeConsumed = false;
  try {
    const result = await pollDeviceCode(flow.deviceAuthId, flow.userCode, request.signal);
    if (result.status === 'pending') {
      const retryAfter = result.slowDown
        ? Math.min(30, Math.max(flow.interval + 5, result.interval ?? 0))
        : flow.interval;
      if (retryAfter !== flow.interval) {
        await writeDeviceFlow({ ...flow, interval: retryAfter });
      }
      return Response.json(
        { status: 'pending' },
        {
          status: 202,
          headers: noStoreHeadersWith({ 'Retry-After': String(retryAfter) }),
        }
      );
    }

    const credentials = await exchangeDeviceCode(
      result.authorizationCode,
      result.codeVerifier,
      request.signal
    );
    deviceCodeConsumed = true;
    try {
      await writeAuthSession(credentials);
    } finally {
      // The authorization code is single-use once exchange succeeds, even if the
      // client disconnects or persisting the new session fails afterward.
      await clearDeviceFlow();
    }
    return Response.json({ status: 'authenticated' }, { headers: noStoreHeaders });
  } catch (error) {
    if (!deviceCodeConsumed && (request.signal.aborted || isAbortError(error))) {
      return Response.json(
        { status: 'pending' },
        { status: 202, headers: noStoreHeadersWith({ 'Retry-After': String(flow.interval) }) }
      );
    }

    if (error instanceof SessionCookieTooLargeError) {
      console.error('The ChatGPT OAuth session does not fit in a browser cookie.', error);
      return Response.json(
        { error: 'The ChatGPT session is too large for this cookie-based demo.' },
        { status: 413, headers: noStoreHeaders }
      );
    }

    if (deviceCodeConsumed) {
      console.error('Unable to persist the completed ChatGPT authorization.', error);
      return Response.json(
        { error: 'Unable to save the ChatGPT session. Start again.' },
        { status: 502, headers: noStoreHeaders }
      );
    }

    if (isTransientOAuthError(error)) {
      console.error('ChatGPT authorization is temporarily unavailable.', error);
      return Response.json(
        { error: 'ChatGPT authorization is temporarily unavailable.' },
        {
          status: 503,
          headers: noStoreHeadersWith({ 'Retry-After': String(flow.interval) }),
        }
      );
    }

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
