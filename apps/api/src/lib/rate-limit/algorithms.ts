import { randomUUID } from 'node:crypto';
import {
  TOKEN_BUCKET_SCRIPT,
  SLIDING_WINDOW_COUNTER_SCRIPT,
  SLIDING_WINDOW_LOG_SCRIPT,
} from './scripts.js';
import { redis } from '../redis.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining?: number; // best-effort, algorithm-dependent
}

// 1. Fixed window — INCR is atomic on its own, no Lua needed.
// (See notes.md: two separate calls is safe here specifically because
// INCR's count is never subject to a race, only the TTL timing is,
// and a slightly-late EXPIRE is harmless.)
export async function fixedWindow(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const fullKey = `${key}:${bucket}`;

  const count = await redis.incr(fullKey);
  if (count === 1) {
    await redis.expire(fullKey, windowSeconds);
  }

  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

// 2. Token bucket — Lua for atomic refill+consume.
export async function tokenBucket(
  key: string,
  capacity: number,
  refillRatePerSecond: number,
  requested = 1
): Promise<RateLimitResult> {
  const now = Date.now() / 1000;
  const [allowed, tokensRemaining] = (await redis.eval(
    TOKEN_BUCKET_SCRIPT,
    1,
    key,
    capacity,
    refillRatePerSecond,
    now,
    requested
  )) as [number, string];

  return { allowed: allowed === 1, remaining: Math.floor(Number(tokensRemaining)) };
}

// 3. Sliding window counter — weighted average of current+previous window.
export async function slidingWindowCounter(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now() / 1000;
  const currentBucket = Math.floor(now / windowSeconds);
  const previousBucket = currentBucket - 1;
  const elapsedFraction = (now % windowSeconds) / windowSeconds;

  const currentKey = `${key}:${currentBucket}`;
  const previousKey = `${key}:${previousBucket}`;

  const [allowed, estimated] = (await redis.eval(
    SLIDING_WINDOW_COUNTER_SCRIPT,
    2,
    currentKey,
    previousKey,
    limit,
    elapsedFraction,
    windowSeconds
  )) as [number, string];

  return { allowed: allowed === 1, remaining: Math.max(0, limit - Math.ceil(Number(estimated))) };
}

// 4. Sliding window log — exact, via a Redis sorted set. Use sparingly
// (O(N) memory) — this is the "Login / 2FA / password reset" algorithm
// per the notes, not a general-purpose default.
export async function slidingWindowLog(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const member = `${now}:${randomUUID()}`; // must be unique per request

  const allowed = (await redis.eval(
    SLIDING_WINDOW_LOG_SCRIPT,
    1,
    key,
    now,
    windowMs,
    limit,
    member
  )) as number;

  return { allowed: allowed === 1 };
}