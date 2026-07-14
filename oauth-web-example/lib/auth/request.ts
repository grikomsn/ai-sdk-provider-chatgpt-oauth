export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) {
    return false;
  }

  try {
    return new URL(origin).origin === expectedOrigin(request);
  } catch {
    return false;
  }
}

export function trustsForwardedHeaders(): boolean {
  return process.env.VERCEL === '1' || process.env.TRUST_PROXY === 'true';
}

function lastHeaderValue(value: string | null): string | undefined {
  return value?.split(',').at(-1)?.trim() || undefined;
}

function expectedOrigin(request: Request): string {
  if (process.env.APP_ORIGIN) {
    return new URL(process.env.APP_ORIGIN).origin;
  }

  if (!trustsForwardedHeaders()) {
    const requestUrl = new URL(request.url);
    const host = request.headers.get('host') ?? requestUrl.host;
    return new URL(`${requestUrl.protocol}//${host}`).origin;
  }

  const requestUrl = new URL(request.url);
  const host =
    lastHeaderValue(request.headers.get('x-forwarded-host')) ??
    request.headers.get('host') ??
    requestUrl.host;
  const protocol =
    lastHeaderValue(request.headers.get('x-forwarded-proto')) ?? requestUrl.protocol.slice(0, -1);

  if (!['http', 'https'].includes(protocol)) {
    throw new Error('Unsupported request protocol.');
  }

  return new URL(`${protocol}://${host}`).origin;
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
