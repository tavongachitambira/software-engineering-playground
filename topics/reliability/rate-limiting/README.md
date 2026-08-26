# Rate Limiting

## What is it?

Rate limiting is a reliability control that caps how many requests a
client (identified by IP, user, or API key) can make in a given period.
It exists to protect a system from three distinct problems: abuse and
DDoS traffic, accidental overload from runaway retries or misbehaving
scripts, and cost control when an endpoint calls a paid third-party
service. It adds negligible latency to a request but prevents the kind
of traffic spike that can take an entire API down or blow through a
billing budget.

## How it works

Four algorithms solve this with different accuracy/memory/burst-tolerance
tradeoffs — I implemented all four to compare them directly rather than
picking one on faith.

**Fixed window** divides time into non-overlapping blocks and counts
requests per block with a simple counter. Cheapest to implement and
reason about, but it has a real flaw: a client can send a full quota
right at the end of one window and another full quota right at the start
of the next, doubling the intended rate in a couple of seconds. I
reproduced this with a token-bucket-vs-fixed-window burst test and saw
it happen against my own running server, not just in theory.

**Token bucket** tracks a token count and a last-refill timestamp per
client. Tokens refill continuously at a fixed rate up to a capacity
ceiling; each request consumes one. This naturally allows short bursts
(up to the bucket's capacity) while enforcing a stable long-term average
rate — it's the algorithm I used for the general-purpose edge layer.

**Sliding window counter** blends the current and previous window's
counts using a weighted average based on how far into the current window
the request landed. It's an approximation (assumes even traffic
distribution within a window) but gets close to sliding-window-log
accuracy at fixed-window's memory cost — this is what production systems
at scale (Cloudflare, Stripe) actually run.

**Sliding window log** keeps an exact timestamped log of every request in
a Redis sorted set, pruning entries older than the window on each check.
100% accurate, but memory grows with request volume — I scoped this one
specifically to the login endpoint (5 attempts/minute), since it's a
low-traffic, high-security surface where exactness matters more than
memory efficiency.

### The concurrency problem, and why the fix differs per algorithm

Fixed window's `INCR` command is atomic on its own — Redis is
single-threaded, so even under concurrent load, `INCR` always hands out
a strictly sequential count. No client can "double-spend" past the limit
just by racing another request. The one thing that ISN'T atomic in that
implementation — the `EXPIRE` call setting the key's TTL — doesn't matter
for correctness; a slightly-late `EXPIRE` just means the key lives a few
extra milliseconds, not an incorrect count.

Token bucket doesn't get this for free. It tracks two fields (`tokens`,
`last_refill`) and requires a read-compute-write cycle on every request.
Done as separate application-level Redis calls, two concurrent requests
can both read the same stale `tokens` count, both decide they're allowed,
and both proceed — a genuine double-spend under load. The fix is running
the whole refill-check-consume sequence as a single Redis Lua script
(`EVAL`), which Redis executes as one atomic, uninterruptible operation.

### Where to enforce it, and by what identifier

I layered this per the "defense in depth" pattern rather than picking one
identifier globally:

- **Edge layer, by IP** — a blanket ceiling (e.g. 5000 req/min) applied
  to every request via an `onRequest` hook, catching basic
  scraping/DDoS traffic before it reaches any route logic. Fails open —
  an outage here shouldn't take the whole API down.
- **Auth layer, by IP + route** — the login endpoint specifically, since
  User ID doesn't exist yet at that point in the flow (rate-limiting
  failed logins by User ID would let an attacker lock out a real user
  just by spamming their username with wrong passwords). Fails closed —
  this is a security-critical surface.
- **Application layer, by User ID** — authenticated routes, ensuring one
  heavy user can't monopolize resources or exceed a pricing tier. Must
  run after the RBAC plugin's `authenticate` hook, since it needs
  `request.user` to already be populated.

## How to implement it

- `lib/rate-limit/scripts.ts` — the three Lua scripts (token bucket,
  sliding window counter, sliding window log) as raw strings passed to
  `redis.eval()`.
- `lib/rate-limit/algorithms.ts` — one function per algorithm, wrapping
  the Redis calls (`INCR`/`EXPIRE` for fixed window, `EVAL` for the
  other three).
- `lib/rate-limit/identifiers.ts` — small functions (`byIp`, `byUserId`,
  `byApiKey`, `byIpAndRoute`) that extract the key to rate-limit on from
  a request, kept separate from the algorithm logic so any identifier
  can pair with any algorithm.
- `plugins/rate-limit.ts` — a Fastify plugin exposing `app.rateLimit(config)`,
  using a discriminated union type so each algorithm only accepts the
  config fields it actually needs (catches, at compile time, passing
  `capacity` to a fixed-window config, for example).

## Common mistakes I hit building this

- **Fastify hook registration order matters.** A global `onRequest` hook
  added inside `app.after()` does NOT retroactively apply to routes that
  were registered earlier in the same file — Fastify builds each route's
  hook chain at the moment the route is declared. I had `/health`
  registered before the rate-limit hook existed, so it silently never
  ran the limiter at all, with zero errors, because `failMode: 'open'`
  swallowed the exception. Fix: register routes that need a global hook
  AFTER the hook itself is added, or add the hook before any routes.
- **`Fastify({ logger: false })` hides the exact bug above.** With
  logging off, a swallowed error in the fail-open catch block produces
  no output anywhere — it looks identical to the limiter "just not
  limiting." Always run with logging on while debugging middleware,
  even temporarily.
- **`await app.ready()` followed by more setup code is a trap.** `.ready()`
  fully seals the Fastify instance — nothing can register hooks/plugins
  after it resolves. The correct tool for "run this once everything
  above has loaded, but don't seal the instance yet" is `app.after()`,
  not `.ready()`.
- **A leftover native `redis-server` silently squats on port 6379.**
  `docker run -p 6379:6379` fails with "address already in use" if
  something else (a system package install, a forgotten prior setup) is
  already listening there — `sudo lsof -i :6379` / `sudo ss -tlnp` finds
  it, `systemctl stop`/`disable` clears it.
- **Token bucket's config has no `limit` field, only `capacity`.** My
  first version of the plugin's TypeScript type required `limit` on
  every config regardless of algorithm — caught at compile time once I
  switched to a discriminated union, but worth remembering conceptually:
  "the limit" means something different per algorithm (a window count vs
  a bucket size), don't force one field name across all of them.

## Related topics
- `authorization/rbac` — the application-layer per-user limiter depends
  on `role`/`sub` claims populated by the RBAC plugin's `authenticate`
  decorator; it must run after that hook in the `preHandler` chain.
- `idempotency-keys` (next) — reuses the same `SET NX EX` atomic-claim
  pattern this topic's fixed-window limiter is built on, applied to a
  different problem (deduplicating retried writes instead of throttling
  request volume).