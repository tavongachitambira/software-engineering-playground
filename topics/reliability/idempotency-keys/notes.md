# Idempotency Keys

## Research summary  
(sources: Stripe API docs, Stripe error handling docs)

### What problem this solves
When a client sends a POST and the network drops before the response arrives, the client has no way to know if the server actually processed it. Retrying blindly risks duplicating the side effect (a second charge, a second incident). Idempotency keys let the client safely retry the exact same logical request — the server recognizes the retry and returns the original result instead of doing the work twice.

Idempotency is a web API design principle defined as the ability to apply the same operation multiple times without changing the result beyond the first try. It makes it safe to retry API requests in some situations—in particular, when the first request gets no response because of a network error. Because a certain amount of intermittent failure is to be expected, clients need a way of reconciling failed requests with a server, and idempotency provides a mechanism for that.

### Core mechanism
1. Client generates a key once (UUID v4 recommended, up to 255 chars, no sensitive data in it) and sends it in the `Idempotency-Key` header on the original request and every retry of that same attempt.
2. Server claims the key atomically on first sight, marks it `in-progress`, proceeds to execute the handler.
3. On completion — success OR failure — the server caches the exact response (status code + body) against that key.
4. A repeat request with the same key returns the cached response verbatim, with `Idempotent-Replayed: true` set.
5. Same key + different body = client error, not a valid retry — rejected explicitly rather than guessed at.
6. Keys expire after 24 hours; reuse after expiry starts a fresh request.
7. Only applies to POST — GET/DELETE are idempotent by definition per HTTP semantics, sending a key there has no effect.

Most client libraries can generate idempotency keys and retry requests automatically, but you need to configure it. For finer-grained control over retries, generate idempotency keys and write your own logic for retries.

**Sending idempotency keys**  
Idempotency keys are sent in the `Idempotency-Key` header. Use them for all POST requests to the Stripe API. Most official client libraries can send them automatically, as long as they’re configured to send retries.

If you decide to send idempotency keys manually, make sure the tokens being used are sufficiently unique to unambiguously identify a single operation within your account over the last 24 hours, at a minimum. There are two common strategies for generating idempotency keys:
- Use an algorithm that generates a token with enough randomness, like UUID v4.
- Derive the key from a user-attached object, like the ID of a shopping cart. This provides a relatively straightforward way to protect against double submissions.

To identify a previously executed response that’s being replayed from the server, look for the header `Idempotent-Replayed: true`.

### Security / correctness considerations
- Results are only cached once execution has actually begun. A request that fails validation before reaching the handler, or one rejected by a rate limiter (429) running ahead of the idempotency layer, is safe to retry with a fresh outcome — it was never “claimed.”
- A `500` response **is** cached and replayed identically on retry — Stripe explicitly documents this as intentional, since the alternative (retry produces a different result) would be worse: the client genuinely cannot tell whether the original 500 had side effects or not, so Stripe treats it as indeterminate and advises against generating a new key just to “try again,” since the original key may already have caused effects.
- Concurrent requests with the same key must be handled atomically — a naive check-then-act from application code has the same TOCTOU race as token bucket’s read-modify-write problem.

### Common misconceptions & mistakes
- **“Idempotency keys make ANY request safe to blindly retry.”**  
  No — they only protect against duplicating the specific operation tied to that key. Retrying with a NEW key on every attempt (a common client bug) provides zero protection, since each attempt looks like a brand new operation to the server.

- **“A cached error response means the retry ‘failed’ from the client’s perspective.”**  
  Not necessarily — Stripe’s guidance is to treat a replayed 500 as indeterminate, not simply “still broken.” The server may have reconciled the underlying side effect out-of-band even though the cached HTTP response itself never changes.

- **“The idempotency key IS the resource ID.”**  
  It isn’t — it’s a request-deduplication token. The created resource still gets its own ID; the key just ensures the SAME resource is returned on retry rather than a second one being created.

- **Don’t cache the result before the handler has actually started executing** — a request that fails validation up front was never “claimed” and should remain freely retryable.

- **Don’t let the stored key’s TTL reset on completion** — the 24h clock starts at the ORIGINAL request, not when it finished. A slow handler extending its own key’s lifetime indefinitely would be a bug.

- **Don’t build two independent crash-recovery mechanisms that both try to release the same lock** (e.g. an `onError` hook alongside a Lua script’s staleness check). Keep only one path (staleness-based reclaim) — two paths racing to mutate the same key on a crash is a new bug, not a safety net.

- **Don’t forget the header value can arrive as a string OR an array of strings** in Node’s HTTP layer if a client (or misbehaving proxy) sends it twice — handle that explicitly rather than assuming a single string.

### The Stripe-Should-Retry header
A client library can’t always determine with certainty if it should retry based solely on a status code or content in the response body. The API responds with the `Stripe-Should-Retry` header when it has additional information that the request is retryable.

- `Stripe-Should-Retry: true` → client should retry (still wait according to exponential backoff).
- `Stripe-Should-Retry: false` → client should **not** retry.
- Header absent → fall back to status code / body.

The retry mechanisms built into Stripe client libraries respect this header automatically.

### HTTP Status Code Reference
| Code | Meaning | Notes |
|------|---------|-------|
| 200 | OK | Everything worked as expected. |
| 400 | Bad Request | The request was unacceptable, often due to missing a required parameter. |
| 401 | Unauthorized | No valid API key provided. |
| 402 | Request Failed | The parameters were valid but the request failed. |
| 403 | Forbidden | The API key doesn’t have permissions to perform the request. |
| 409 | Conflict | The request conflicts with another request (perhaps due to using the same idempotent key). |
| 424 | External Dependency Failed | The request couldn’t be completed due to a failure in a dependency external to Stripe. |
| 429 | Too Many Requests | Too many requests hit the API too quickly. Use exponential backoff. |
| 500, 502, 503, 504 | Server Errors | Something went wrong on Stripe’s end. |

### Quotable line
> “Idempotency keys ensure that operations, such as creating an object, can be safely retried without accidentally performing the same operation twice.”  
> — Stripe API documentation, Idempotent Requests

### Related topics
- `rate-limiting` — same atomic-claim-via-Lua-script primitive, applied to a different problem (deduplicating retried writes vs throttling request volume). The fixed-window limiter’s `SET NX EX` pattern and this topic’s claim script are conceptually the same move.

