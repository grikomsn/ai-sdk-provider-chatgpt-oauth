import { requestDeviceCode } from '@/lib/auth/openai-oauth';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { isSameOrigin, noStoreHeaders, noStoreHeadersWith } from '@/lib/auth/request';
import { writeDeviceFlow } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: 'Cross-origin request rejected.' },
      { status: 403, headers: noStoreHeaders }
    );
  }

  const rateLimit = checkRateLimit(request, 'device-start', { limit: 5, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Too many authorization attempts. Try again shortly.' },
      {
        status: 429,
        headers: noStoreHeadersWith({ 'Retry-After': String(rateLimit.retryAfterSeconds) }),
      }
    );
  }

  try {
    const deviceCode = await requestDeviceCode(request.signal);
    await writeDeviceFlow({
      deviceAuthId: deviceCode.deviceAuthId,
      userCode: deviceCode.userCode,
      interval: deviceCode.interval,
      expiresAt: deviceCode.expiresAt,
    });

    return Response.json(
      {
        userCode: deviceCode.userCode,
        verificationUrl: deviceCode.verificationUrl,
        interval: deviceCode.interval,
      },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error('Unable to start ChatGPT device authorization.', error);
    return Response.json(
      { error: 'Unable to start ChatGPT authorization. Try again.' },
      { status: 502, headers: noStoreHeaders }
    );
  }
}
