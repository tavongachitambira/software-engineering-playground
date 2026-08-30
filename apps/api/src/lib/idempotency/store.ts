import { createHash } from 'node:crypto';
import { redis } from "../redis"
import { CLAIM_SCRIPT } from './scripts.js';

const TTL_SECONDS = 24 * 60 * 60; // 24h — matches Stripe's documented key expiry
const STALE_AFTER_SECONDS = 30; // crash-recovery window, see scripts.ts comment

export type ClaimResult =
  | { status: 'claimed' }
  | { status: 'in-progress' }
  | { status: 'mismatch' }
  | { status: 'completed'; statusCode: number; body: string };

// Normalized so key order in the body doesn't produce a different hash
// for what's semantically the same request.
export function hashRequestBody(body: unknown): string {
  const obj = (body ?? {}) as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const normalized = JSON.stringify(obj, sortedKeys);
  return createHash('sha256').update(normalized).digest('hex');
}

export async function claimIdempotencyKey(
  idempotencyKey: string,
  requestHash: string
): Promise<ClaimResult> {
  const key = `idempotency:${idempotencyKey}`;
  const now = Math.floor(Date.now() / 1000);

  const result = (await redis.eval(
    CLAIM_SCRIPT,
    1,
    key,
    requestHash,
    TTL_SECONDS,
    now,
    STALE_AFTER_SECONDS
  )) as ['claimed'] | ['in-progress'] | ['mismatch'] | ['completed', string, string];

  switch (result[0]) {
    case 'claimed':
      return { status: 'claimed' };
    case 'in-progress':
      return { status: 'in-progress' };
    case 'mismatch':
      return { status: 'mismatch' };
    case 'completed':
      return { status: 'completed', statusCode: Number(result[1]), body: result[2] };
  }
}

// Stores the FINAL result — called from onSend, so this runs for every
// response the handler actually produced, success or error alike. This
// is what gives us Stripe's "caches results regardless of whether they
// succeed or fail, including 500s" behavior.
export async function storeIdempotentResult(
  idempotencyKey: string,
  statusCode: number,
  body: string
): Promise<void> {
  const key = `idempotency:${idempotencyKey}`;
  // Deliberately no EXPIRE call here — the TTL set at claim time keeps
  // running. The 24h clock starts from the ORIGINAL request, not from
  // when it finished, matching Stripe's stated behavior.
  await redis.hset(key, { status: 'completed', statusCode: String(statusCode), body });
}