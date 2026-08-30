# Idempotency Keys

## What is it?

Idempotency keys make an inherently non-idempotent operation (`POST`,
which by HTTP convention has no guarantee that repeating it is safe)
safe to retry. The client generates a unique key once per logical
operation and sends it on the original request and every retry of that
same request. The server uses it to recognize "this is the same attempt
again," not a new one — so a network timeout that leaves the client
unsure whether the first request succeeded can be safely retried without
risking a duplicate side effect (a second incident, a duplicate charge).

## How it works

**Claiming a key.** The first request with a given key atomically claims
it in Redis (`in-progress` state) and proceeds to the handler. This has
to be atomic — two concurrent requests with the same key racing to check
"does this exist yet" and both concluding "no" would let both through,
defeating the entire mechanism. Same atomicity requirement as token
bucket's read-modify-write problem from the rate-limiting topic, same
fix: a Lua script.

**Storing the result.** Once the handler finishes — success OR error —
the response is cached against the key. This matters: per Stripe's docs,
a `500` gets cached and replayed just like a `201` would. The reasoning
is that from the client's perspective, both are "the server gave me an
answer" — what's unsafe to retry-and-duplicate is a request that never
got a definitive answer at all (a network error), not one that got an
error response.

**Replaying.** A repeat request with the same key + same body returns
the cached response verbatim, with an `Idempotent-Replayed: true` header
so the client can tell the difference between a fresh execution and a
replay.

**Detecting misuse.** Same key, DIFFERENT body → this is a client bug
(reusing a key across two logically different operations), not a valid
retry. Rejected with an error rather than silently doing either
operation.

**The concurrent-in-flight case.** If a retry arrives WHILE the original
request is still processing (client gave up too early, or the two
requests are genuinely racing), it gets rejected with `409` rather than
either queued or run again — the original is still the authoritative
attempt.

**Crash recovery.** If a claim is stuck in `in-progress` for longer than
a short staleness window (30s in this implementation), it's treated as
an abandoned request from a crashed server and can be reclaimed. This
detail isn't in Stripe's public docs — it's a deliberate addition here,
since without it a server crash mid-request would permanently lock that
key.

## How to implement it

- `lib/idempotency/scripts.ts` — the Lua script handling claim, mismatch
  detection, in-progress detection (with staleness check), and returning
  a completed result for replay — all as one atomic operation.
- `lib/idempotency/store.ts` — `hashRequestBody` (normalizes + hashes the
  request body so key order doesn't produce spurious mismatches),
  `claimIdempotencyKey`, `storeIdempotentResult`.
- `plugins/idempotency.ts` — a Fastify plugin using a `preHandler` hook
  to claim/replay/reject, and an `onSend` hook to persist whatever
  response the handler actually produced. Routes opt in explicitly via
  `{ config: { idempotent: true } }` rather than this applying globally.

## Common mistakes I hit / deliberately guarded against

- **Fastify plugin/route registration order.** Same class of bug as the
  rate-limiting topic: plugins that add decorators/hooks must finish
  registering before any route that depends on them is registered.
  Fixed by strictly ordering the whole `index.ts` as plugins → global
  hooks (inside `app.after()`) → routes, always in that order.
- **Two independent mechanisms trying to release the same lock is worse
  than one.** Initially considered an `onError` hook to release a claim
  on crash, running ALONGSIDE the staleness-based reclaim in the Lua
  script — decided against it, since two paths racing to mutate the same
  key on a crash is a new bug waiting to happen, not a safety net.
  Staleness-based reclaim alone is simpler and sufficient.
- **The TTL must start at claim time, not completion time.** `storeIdempotentResult`
  deliberately does NOT reset the key's expiry — if it did, a slow
  handler could keep extending its own key's lifetime indefinitely
  instead of the intended fixed 24h window from the original request.

## Related topics
- `rate-limiting` — same underlying primitive (atomic Redis claim via Lua
  for a read-modify-write that plain commands can't do safely), applied
  to a different problem: deduplicating retried writes here, throttling
  request volume there.