// Lightweight in-memory token-bucket rate limiter.
// Suitable for single-instance dev/prod. For multi-instance production,
// back this with Redis (same interface).

type Bucket = { tokens: number; updated: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfter: number; // seconds
};

/**
 * @param key       unique identifier (e.g. `analyze:${userId}`)
 * @param limit     max requests per window
 * @param windowMs  window length in ms
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const refillRate = limit / windowMs;
  const bucket = buckets.get(key) ?? { tokens: limit, updated: now };

  // Refill based on elapsed time
  const elapsed = now - bucket.updated;
  bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillRate);
  bucket.updated = now;

  if (bucket.tokens < 1) {
    const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate / 1000);
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfter };
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return { ok: true, remaining: Math.floor(bucket.tokens), retryAfter: 0 };
}

// Occasionally purge stale buckets to avoid unbounded growth.
if (typeof setInterval !== "undefined") {
  const timer = setInterval(
    () => {
      const cutoff = Date.now() - 60 * 60 * 1000;
      buckets.forEach((v, k) => {
        if (v.updated < cutoff) buckets.delete(k);
      });
    },
    10 * 60 * 1000,
  );
  // Don't keep the process alive just for cleanup.
  (timer as unknown as { unref?: () => void }).unref?.();
}
