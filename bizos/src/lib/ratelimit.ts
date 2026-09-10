// In-memory fixed-window rate limiter. Sufficient for a single-instance MVP;
// swap the store for Redis/Upstash in production (same interface). Keyed by a
// caller identity (userId or IP) + bucket name.

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

export class RateLimitError extends Error {
  constructor() {
    super("יותר מדי בקשות, נסה שוב בעוד רגע");
    this.name = "RateLimitError";
  }
}

/**
 * Throws RateLimitError when `key` exceeds `limit` requests per `windowMs`.
 * Handled by errorResponse() → HTTP 429.
 */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = store.get(key);
  if (!b || b.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > limit) throw new RateLimitError();
}

// Opportunistic cleanup to bound memory.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) if (v.resetAt < now) store.delete(k);
  }, 60_000).unref?.();
}

export function clientKey(req: Request, salt: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anon";
  return `${salt}:${ip}`;
}
