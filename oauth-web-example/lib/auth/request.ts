export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) {
    return false;
  }

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host') || requestUrl.host;
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProtocol || requestUrl.protocol.slice(0, -1);

  if (!['http', 'https'].includes(protocol)) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}

export const noStoreHeaders = {
  'Cache-Control': 'no-store',
} as const;

export function noStoreHeadersWith(
  additionalHeaders: Record<string, string>
): Record<string, string> {
  return {
    ...noStoreHeaders,
    ...additionalHeaders,
  };
}
