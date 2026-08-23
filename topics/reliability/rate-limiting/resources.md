# Resources: Rate Limiting

## Official documentation
- [Redis: EVAL / Lua scripting](https://redis.io/docs/latest/develop/interact/programmability/eval-intro/) — required reading before Day 3's token bucket, since the atomicity there depends on this.
- [Redis: INCR command](https://redis.io/commands/incr/) and [EXPIRE command](https://redis.io/commands/expire/) — the two primitives behind the naive fixed-window version you'll build first.
- [@fastify/rate-limit plugin docs](https://github.com/fastify/fastify-rate-limit) — read the source, not just the README. Seeing a production plugin's actual implementation before hand-rolling your own is more useful than the usage docs alone.

## Articles / blog posts
- Cloudflare: ["How we built rate limiting capable of scaling to millions of domains"](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/) — the single best resource for this topic. Walks through the fixed-window boundary problem concretely, then the tradeoffs of moving to a shared counter store under real traffic. Notes that rate limiting works by defining rules matching particular HTTP requests, counting every matching request per client IP, and once that counter exceeds a threshold, blocking further requests from reaching the origin server. 
- Stripe docs: "Rate Limits" (search: `stripe api rate limits docs`) — a real production API's actual limits and headers, useful as a reference for what response shape (`Retry-After`, limit headers) looks like from the client's side.

## GitHub repositories
- [fastify/fastify-rate-limit](https://github.com/fastify/fastify-rate-limit) — same as above, the actual source.

## RFCs / specs
- [RFC 6585 — Additional HTTP Status Codes](https://datatracker.ietf.org/doc/html/rfc6585) — defines `429 Too Many Requests` and the `Retry-After` semantics precisely. Short, worth reading section 4 in full.

(General-purpose access-control/reliability resources beyond this topic go in `/resources/` per repo convention.)