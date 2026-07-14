import { isSameOrigin, noStoreHeaders } from '@/lib/auth/request';
import { clearAuthSession, clearDeviceFlow } from '@/lib/auth/session';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  await Promise.all([clearAuthSession(), clearDeviceFlow()]);
  return Response.json({ status: 'signed-out' }, { headers: noStoreHeaders });
}
