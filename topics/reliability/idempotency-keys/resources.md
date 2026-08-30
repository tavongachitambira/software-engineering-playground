# Resources: Idempotency Keys

## Official documentation
- [Stripe: Idempotent Requests](https://docs.stripe.com/api/idempotent_requests) — the reference implementation for this whole topic. Covers key generation, the 24h expiry window, and the exact scope (POST only).
- [Stripe: Advanced Error Handling — Idempotency section](https://docs.stripe.com/error-low-level#idempotency) — the deeper piece: how content errors (4xx), network errors, and server errors (5xx) each interact with idempotency differently, and why a 500 is cached but a 429 might not be (rate limiters run before the idempotency layer).
- [Redis: EVAL / Lua scripting](https://redis.io/docs/latest/develop/interact/programmability/eval-intro/) — same primitive as rate limiting, reused here for the atomic claim.

## Articles / blog posts
- Stripe Engineering Blog: "Implementing Stripe-level Idempotency Keys" (search: `stripe engineering blog idempotency keys implementation`) — the internal engineering writeup, more implementation-detail-focused than the public API docs.

## GitHub repositories
- None specific — this topic is implemented directly against Stripe's public docs rather than a reference open-source library.

## RFCs / specs
- None. Like RBAC, idempotency-key handling isn't a wire protocol — it's a pattern layered on top of plain HTTP POST, not something with its own RFC.

(General-purpose access-control/reliability resources beyond this topic go in `/resources/` per repo convention.)