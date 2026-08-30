# Idempotency Keys — Notes

## Research summary (sources: Stripe API docs, Stripe error handling docs)

### What problem this solves
When a client sends a POST and the network drops before the response
arrives, the client has no way to know if the server actually processed
it. Retrying blindly risks duplicating the side effect (a second charge,
a second incident). Idempotency keys let the client safely retry the
exact same logical request — the server recognizes the retry and returns
the original result instead of doing the work twice.

### Core mechanism
1. Client generates a key once (UUID v4 recommended, up to 255 chars,
   no sensitive data in it) and sends it in the `Idempotency-Key` header
   on the original request and every retry of that same attempt.
2. Server claims the key atomically on first sight, marks it
   `in-progress`, proceeds to execute the handler.
3. On completion — success OR failure — the server caches the exact
   response (status code + body) against that key.
4. A repeat request with the same key returns the cached response
   verbatim, with `Idempotent-Replayed: true` set.
5. Same key + different body = client error, not a valid retry —
   rejected explicitly rather than guessed at.
6. Keys expire after 24 hours; reuse after expiry starts a fresh request.
7. Only applies to POST — GET/DELETE are idempotent by definition per
   HTTP semantics, sending a key there has no effect.

### Security / correctness considerations
- Results are only cached once execution has actually begun. A request
  that fails validation before reaching the handler, or one rejected by
  a rate limiter (429) running ahead of the idempotency layer, is safe
  to retry with a fresh outcome — it was never "claimed."
- A `500` response IS cached and replayed identically on retry — Stripe
  explicitly documents this as intentional, since the alternative (retry
  produces a different result) would be worse: the client genuinely
  cannot tell whether the original 500 had side effects or not, so
  Stripe treats it as indeterminate and advises against generating a new
  key just to "try again," since the original key may already have
  caused effects.
- Concurrent requests with the same key must be handled atomically — a
  naive check-then-act from application code has the same TOCTOU race as
  token bucket's read-modify-write problem.

### Common misconceptions
- **"Idempotency keys make ANY request safe to blindly retry."** No —
  they only protect against duplicating the specific operation tied to
  that key. Retrying with a NEW key on every attempt (a common client
  bug) provides zero protection, since each attempt looks like a brand
  new operation to the server.
- **"A cached error response means the retry 'failed' from the client's
  perspective."** Not necessarily — Stripe's guidance is to treat a
  replayed 500 as indeterminate, not simply "still broken." The server
  may have reconciled the underlying side effect out-of-band even though
  the cached HTTP response itself never changes.
- **"The idempotency key IS the resource ID."** It isn't — it's a
  request-deduplication token. The created resource still gets its own
  ID; the key just ensures the SAME resource is returned on retry rather
  than a second one being created.

### Quotable line
> "Idempotency keys ensure that operations, such as creating an object,
> can be safely retried without accidentally performing the same
> operation twice." — Stripe API documentation, Idempotent Requests

---

## My understanding before reading

Idempotency keys are a header the client sends so that if they retry a
POST request, the server knows it's the same request and doesn't do it
twice — I figured it just meant checking if the key exists and skipping
re-execution if so.

## What I got right vs missed
- Correct: client-generated key, same key means "don't re-execute,"
  general shape of the mechanism.
- Missed: didn't realize errors get cached too — I assumed only
  successful responses were worth caching, and that a failed attempt
  should just be retried fresh. Stripe's stance (cache and replay 500s,
  treat as indeterminate rather than "safe to retry differently") was
  new to me.
- Missed: the same-key-different-body case entirely — hadn't considered
  that this needs explicit detection and rejection rather than either
  silently ignoring the new body or silently processing it.
- Missed: the concurrent in-flight case (retry arrives WHILE the
  original is still running) needing its own distinct state, not just
  "exists or doesn't."
- Clarified: 24h expiry window wasn't something I'd have picked myself —
  worth remembering as a deliberate, documented design choice (long
  enough to cover realistic retry windows, short enough not to grow
  Redis memory unbounded).

## Common mistakes (for future me)
- Don't cache the result before the handler has actually started
  executing — a request that fails validation up front was never
  "claimed" and should remain freely retryable.
- Don't let the stored key's TTL reset on completion — the 24h clock
  starts at the ORIGINAL request, not when it finished. A slow handler
  extending its own key's lifetime indefinitely would be a bug.
- Don't build two independent crash-recovery mechanisms that both try to
  release the same lock (I initially considered an `onError` hook
  alongside the Lua script's staleness check — dropped the hook,
  keeping only the staleness-based reclaim, since two paths racing to
  mutate the same key on a crash is a new bug, not a safety net).
- Don't forget the header value can arrive as a string OR an array of
  strings in Node's HTTP layer if a client (or misbehaving proxy) sends
  it twice — handle that explicitly rather than assuming a single string.

## Related topics
- `rate-limiting` — same atomic-claim-via-Lua-script primitive, applied
  to a different problem (deduplicating retried writes vs throttling
  request volume). The fixed-window limiter's `SET NX EX` pattern and
  this topic's claim script are conceptually the same move.