export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) {
    return true;
  }

  const host = request.headers.get('host');
  const protocol =
    request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.slice(0, -1);
  return host !== null && origin === `${protocol}://${host}`;
}

export const noStoreHeaders = {
  'Cache-Control': 'no-store',
} as const;
