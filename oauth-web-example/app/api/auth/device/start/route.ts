import { requestDeviceCode } from '@/lib/auth/openai-oauth';
import { isSameOrigin, noStoreHeaders } from '@/lib/auth/request';
import { writeDeviceFlow } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  try {
    const deviceCode = await requestDeviceCode();
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
