// Resilient HTTP GET helper for the Polymarket public APIs.
// Features: per-host client-side rate limiting, timeout via AbortController,
// retry with exponential backoff + jitter, and Retry-After handling on 429.
import { config } from '../config.js';
import { logger } from '../logger.js';

const lastRequestAt = new Map(); // host -> epoch ms

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function respectRateLimit(host) {
  const min = config.http.minIntervalMs;
  const last = lastRequestAt.get(host) || 0;
  const wait = last + min - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
}

// Errors thrown carry .status when they originate from an HTTP response.
export class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export async function getJson(url, { query } = {}) {
  const u = new URL(url);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    }
  }
  const host = u.host;
  const maxRetries = config.http.maxRetries;

  let attempt = 0;
  // Total attempts = maxRetries + 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await respectRateLimit(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.http.timeoutMs);
    try {
      const res = await fetch(u, {
        headers: { accept: 'application/json', 'user-agent': 'polymarket-trader-tracker/1.0' },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        // Retryable server-side conditions.
        if (attempt >= maxRetries) throw new HttpError(`HTTP ${res.status} after retries`, res.status);
        const retryAfter = Number(res.headers.get('retry-after'));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseBackoff(attempt);
        logger.warn('http retry', { url: u.toString(), status: res.status, attempt, backoffMs: backoff });
        await sleep(backoff);
        attempt++;
        continue;
      }
      if (!res.ok) {
        throw new HttpError(`HTTP ${res.status} for ${u.pathname}`, res.status);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      // AbortError / network errors are retryable.
      const retryable = err.name === 'AbortError' || err.name === 'TypeError' || err.code === 'ECONNRESET';
      if (retryable && attempt < maxRetries) {
        const backoff = baseBackoff(attempt);
        logger.warn('http network retry', { url: u.toString(), error: err.message, attempt, backoffMs: backoff });
        await sleep(backoff);
        attempt++;
        continue;
      }
      throw err instanceof HttpError ? err : new HttpError(err.message, err.status);
    }
  }
}

function baseBackoff(attempt) {
  const base = 2 ** attempt * 500; // 500ms, 1s, 2s, 4s, ...
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}
