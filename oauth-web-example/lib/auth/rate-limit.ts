import { createHash } from 'node:crypto';
import { trustsForwardedHeaders } from './request';

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
const PRUNE_INTERVAL_MS = 60_000;
const buckets = new Map<string, RateLimitBucket>();
const inFlightOperations = new Set<string>();
let nextPruneAt = 0;

function lastHeaderValue(value: string | null): string | undefined {
  return value?.split(',').at(-1)?.trim() || undefined;
}

function clientAddress(request: Request): string {
  if (process.env.VERCEL === '1') {
    return (
      lastHeaderValue(request.headers.get('x-vercel-forwarded-for')) ??
      lastHeaderValue(request.headers.get('x-forwarded-for')) ??
      'unknown'
    );
  }

  if (trustsForwardedHeaders()) {
    return (
      lastHeaderValue(request.headers.get('x-forwarded-for')) ??
      lastHeaderValue(request.headers.get('x-real-ip')) ??
      'unknown'
    );
  }

  return 'unknown';
}

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function pruneExpiredBuckets(now: number): void {
  if (now < nextPruneAt && buckets.size < MAX_BUCKETS) {
    return;
  }
  nextPruneAt = now + PRUNE_INTERVAL_MS;

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
