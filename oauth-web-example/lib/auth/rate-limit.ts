import { createHash } from 'node:crypto';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const MAX_BUCKETS = 10_000;
const buckets = new Map<string, RateLimitBucket>();
const inFlightOperations = new Set<string>();

function firstHeaderValue(value: string | null): string | undefined {
  return value?.split(',')[0]?.trim() || undefined;
}

function clientAddress(request: Request): string {
  return (
    firstHeaderValue(request.headers.get('x-forwarded-for')) ??
    firstHeaderValue(request.headers.get('x-real-ip')) ??
    'unknown'
  );
}

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function pruneExpiredBuckets(now: number): void {
  if (buckets.size < MAX_BUCKETS) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(
  request: Request,
  scope: string,
  { limit, windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  pruneExpiredBuckets(now);

  const key = hashKey(`${scope}:${clientAddress(request)}`);
  if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (oldestKey) {
      buckets.delete(oldestKey);
    }
  }

  const current = buckets.get(key);
  const bucket =
    !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function acquireOperationLock(scope: string, value: string): (() => void) | null {
  const key = hashKey(`${scope}:${value}`);
  if (inFlightOperations.has(key)) {
    return null;
  }

  inFlightOperations.add(key);
  return () => {
    inFlightOperations.delete(key);
  };
}
