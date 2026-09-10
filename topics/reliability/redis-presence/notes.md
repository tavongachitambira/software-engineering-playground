# Redis — Complete Notes

## 1. What is Redis?

**Definition:** Redis is an in-memory NoSQL data store. The important part is *in-memory* — Redis keeps data primarily in RAM rather than relying on disk as the main place data is served from. Because RAM is extremely fast compared to disk, Redis can perform very fast reads and writes. That speed is the fundamental reason Redis is useful.

**Redis vs a normal database**

Traditional database (e.g. PostgreSQL):
```
Application
     ↓
PostgreSQL
     ↓
   Disk
```

Redis sitting in front of it:
```
Application
     ↓
   Redis
     ↓
PostgreSQL
     ↓
   Disk
```

Redis becomes a fast, temporary layer.

| Redis | PostgreSQL |
|---|---|
| In-memory | Disk-based persistent storage |
| Extremely fast access | Slower than RAM access |
| Great for temporary/frequently accessed data | Great for permanent data |
| Often used as a cache | Usually the source of truth |
| Can store different data structures | Relational database |

**Why Redis if we already have a database?** Speed. You don't replace your permanent database with Redis — you use Redis when some data needs very fast or temporary access.

## 2. Where is Redis useful?

1. **Caching** — instead of repeatedly querying PostgreSQL for the same products, store a copy in Redis; future requests read from Redis.
2. **Rate limiting** — e.g. allow a user only 5 requests every 30 seconds; Redis maintains the request counter.
3. **Counters** — e.g. `product:123:views → 105`, incrementing on every view (105 → 106 → 107...).
4. **Temporary data** — things that don't need to live forever: OTPs, sessions, temporary state, cached API responses.
5. **Frequently accessed data** — prevents the primary database from handling every single request.
6. **Background jobs** — mentioned briefly, not covered in depth.
7. **Messaging** — via Pub/Sub.

## 3. Redis Data Types

- Strings
- Hashes
- Lists
- Sets
- Sorted Sets
- TTL

Redis isn't just `key → string` — it supports different structures depending on what you're representing.

## 4. Redis Strings

A Redis string stores one key → one value. The value can be text, numbers-as-strings, or counter values.

```
KEY                 VALUE
-------------------------
page_views    →      100
```

**SET** — store a value:
```
SET page_views 100
```
Node.js:
```js
await redis.set("page_views", "100");
```

**GET** — retrieve it:
```
GET page_views  →  100
```
Node.js:
```js
const views = await redis.get("page_views");
```

## 5. Strings as Counters

Even though Redis calls this a string, it can treat a numeric string as a counter via `INCR`.

```
page_views → 100
INCR page_views → 101
INCR page_views → 102
INCR page_views → 103
```

Useful for: page views, likes, downloads, API requests, number of attempts — and later, rate limiting.

## 6. Redis Hashes

A Hash is useful when you want many fields under one key — think of it as a small object/map.

Instead of:
```
user:123:name
user:123:email
user:123:city
```
group into one hash:
```
user:123
    name → Sam
    email → sam@example.com
    city → US
```

**HSET** — create/set fields:
```
HSET user:123 name Sam
HSET user:123 city US
```

**HGETALL** — retrieve all fields:
```
HGETALL user:123
→ name → Sam
  city → US
```
Node.js:
```js
const profile = await redis.hGetAll("user:123");
```

Use a Hash when your Redis data naturally looks like an object, e.g. `{ name: "Sam", email: "sam@example.com", city: "US" }`.

## 7. Redis Lists

An ordered collection of values, e.g. `messages → ["hello", "hi", "how are you?"]`. Order matters — useful for ordered messages, queues, recent items, activity feeds.

**LPUSH** — adds to the left/beginning:
```
[] 
LPUSH messages "hello" → ["hello"]
LPUSH messages "hi"    → ["hi", "hello"]
```

**RPUSH** — adds to the right/end:
```
RPUSH messages "hello"
RPUSH messages "hi"
→ ["hello", "hi"]
```

Remember: `LPUSH → left`, `RPUSH → right`.

## 8. LRANGE

Retrieves elements from a range of a list.
```
LRANGE messages start stop
LRANGE messages 0 -1   → the entire list
```

## 9. LTRIM

Trims an existing list so only a specified range remains — useful for keeping only a limited number of recent items.
```
["A", "B", "C", "D", "E"]  →  trim  →  ["A", "B", "C"]
```

## 10. Redis Sets

A collection of unique values — duplicates are ignored.

```
SADD tags nodejs
SADD tags nextjs
SADD tags nextjs   ← ignored, already exists

Result: { nodejs, nextjs }
```

**SCARD** — count of unique members:
```
SCARD tags → 2
```

## 11. Sorted Sets

Store `member + score`, ordered by score. Perfect for leaderboards, rankings, scores, priority-based data.

```
leaderboard
----------------
Player A → 100
Player B → 200
```

## 12. ZADD

Adds a member with a score:
```
ZADD leaderboard 100 playerA
ZADD leaderboard 200 playerB
```

## 13. ZINCRBY

Increases a member's score:
```
playerA → 100
ZINCRBY leaderboard 50 playerA
→ playerA → 150
```
Useful for leaderboards — no need to manually read, add, and write back the score.

## 14. ZREVRANK

Gives the rank of a member ordered from highest → lowest score. **Redis starts ranking at 0.**

```
Score
200 → Player B → rank 0  (highest)
150 → Player A → rank 1
100 → Player C → rank 2
```

## 15. TTL — Time To Live

Tells Redis how long a key should exist before it's automatically deleted.

```
OTP → 123456, TTL → 60 seconds
→ after 60s: OTP deleted
```

TTL matters because Redis is often used for temporary data (OTPs, sessions, cache, temporary tokens) that shouldn't persist forever.

**EXPIRE** — set expiry on an existing key:
```
SET otp 123456
EXPIRE otp 60
```

**TTL** — check seconds remaining:
```
TTL otp → 58, 57, 56, ... 0 → key disappears
```

## 16. SETEX / Setting a Value With TTL

Store a value and its TTL together:
```
SETEX cache_key 60 value
```
In Node.js, this is the `setEx` operation — ensures cached data doesn't remain indefinitely. Extremely useful for caching.

## 17. Redis Connection

```js
import { createClient } from "redis";
const redisClient = createClient({ url: redisUrl });
```

Basic lifecycle: `createClient → connect → ping → quit`

**connect()** — opens the connection:
```js
await redisClient.connect();
```

**PING** — verifies Redis is responding:
```js
await redisClient.ping(); // → PONG
```

**Connection events:** `connect` (TCP connection established), `ready` (client ready to process commands), `error` (something went wrong), `end` (connection closed).

**quit()** — gracefully closes the connection:
```js
await redisClient.quit();
```
When the Node server stops, the Redis connection should be closed too.

## 18. Caching

Caching means storing a copy of data in a fast location so future requests can retrieve it quickly, instead of repeatedly querying the main database. Reduces database load, improves response time, handles repetitive reads efficiently.

## 19. Why Redis is good for caching

- **Reduce database load** — 1000 requests can become "Redis handles most, few DB queries" instead of 1000 DB queries.
- **Improve response time** — Redis returns frequently accessed data very quickly.
- **Handle repetitive reads** — no reason to repeatedly hit PostgreSQL for the same product list.

## 20. Cache-Aside Pattern (a.k.a. Lazy Loading)

The application itself manages both the cache and the database.

```
             Request
                ↓
          Check Redis
           /       \
        HIT         MISS
        ↓             ↓
   Return data     Query DB
                      ↓
                 Store in Redis
                      ↓
                 Return data
```

## 21. Cache Hit

The requested data is already in Redis — no database query necessary.
```
Client → API → Redis → CACHE HIT → Return data
```
Optimal path: bypasses the slower main database.

## 22. Cache Miss

The requested data isn't in Redis.
```
Client → API → Redis → CACHE MISS → PostgreSQL → Get products → Store in Redis → Return products
```
The next request can then be a cache hit — this is the essence of cache-aside.

## 23. Concrete Cache-Aside Example

Redis starts empty (`products:all → nothing`).

1. `GET products:all` → `null` → **CACHE MISS**
2. Query PostgreSQL: `SELECT * FROM products;` → `[keyboard, mouse, laptop]`
3. Store in Redis: `SETEX products:all 60 "[...]"`
4. Return the products.

Next request: Redis now has `products:all` → **CACHE HIT**, database isn't queried.

## 24. Why TTL is important for Cache

If `products:all` is cached for 60 seconds, after that Redis automatically removes it. The next request becomes a miss again → database → fresh data → Redis. TTL prevents cached data from living forever.

## 25. The Stale Cache Problem

Database has `[keyboard, mouse, laptop, desktop]` after someone adds `desktop`, but Redis still has the old `[keyboard, mouse, laptop]`. The app asks Redis and gets the outdated list back. **The cache is valid (it exists) but no longer represents the latest database state.**

## 26. Another Stale Cache Example

```
Product price = ₹100 → cached in Redis as product:10 → price ₹100
DB updates: price = ₹500
Redis still has: ₹100
```
API can return ₹100 even though the DB says ₹500. "We'll use Redis caching" isn't enough on its own — you must think about cache consistency.

## 27. Cache Invalidation

**Rule:** Invalidate/delete the cache when the underlying data changes.
```
DATABASE CHANGES → INVALIDATE CACHE
```
Example: create product → update PostgreSQL → delete `products:all` from Redis. Next request is a miss → PostgreSQL → fresh products → Redis rebuilt with latest data.

## 28. Cache Invalidation on CRUD

Create / Update / Delete all follow: `DB changes → Invalidate relevant cache`.

The key principle isn't "always delete Redis when creating a product" — it's: **whenever a change makes cached data invalid, invalidate the affected cache.** Exact strategy depends on the project.

## 29. Database as the Source of Truth

```
             Source of truth
                   ↓
              PostgreSQL
                   ↑
              Redis cache
```
If Redis has old information: `DELETE CACHE → READ DB → STORE FRESH DATA`. Redis should never become the authoritative version of your data in this pattern.

## 30. Caching Individual Objects

Same cache-aside pattern, applied to a single product (e.g. `product:10`) instead of the whole list:
```
GET /products/10 → GET product:10 from Redis
   HIT → return
   MISS → query DB → set Redis → return
```
Only the cache key changes.

## 31. Cache Keys

Meaningful cache keys make it clear what each Redis entry represents:
```
products:all
product:10
user:123
```
Pattern: `resource + identifier` (e.g. `product:10`, `product:11`, `product:12`).

## 32. Rate Limiting

Restricting how many requests a client can make within a time period, e.g. max 5 requests per 30 seconds.

## 33. Why Redis is useful for Rate Limiting

With multiple backend servers, each maintaining its own in-memory JS counter, the counters diverge (Server A: 3, Server B: 2, Server C: 4) and the rate limit becomes unreliable. Redis provides a **shared counter** all servers read from — this is the key reason Redis fits distributed rate limiting.

## 34. Fixed Window Rate Limiter

```
Maximum requests = 5, Window = 60 seconds
Key: rate_limit:products:<IP>

Request 1 → 1
Request 2 → 2
Request 3 → 3
Request 4 → 4
Request 5 → 5
Request 6 → 6 ❌ → 429 Too Many Requests
```

## 35. Why Expiry is Set Only on the First Request

Setting `EXPIRE` on every request would keep resetting the 60-second window on each new request, so the window never actually closes — not a proper fixed window.

```
FIRST REQUEST → Start 60-second window → Requests accumulate
→ 60 seconds ends → Redis deletes key → Counter starts fresh
```

## 36. Fixed Window Visually

```
Max = 5, Window = 60 sec
10:00:00 → counter = 1, TTL = 60
10:00:05 → counter = 2
10:00:10 → counter = 3
10:00:20 → counter = 4
10:00:30 → counter = 5
10:00:40 → counter = 6 ❌
10:01:00 → Redis key expires
10:01:01 → counter = 1 (new window)
```

## 37. Remaining Requests

```
remaining = Math.max(0, maxRequests - requestCount)
```
E.g. max = 5, current = 3 → remaining = 2. Response headers used: `X-RateLimit-Limit`, `X-RateLimit-Remaining`.

## 38. HTTP 429

When `requestCount > maxRequests`, the server returns `HTTP 429 — Too Many Requests`, with a message asking the client to try again later.

## 39. Applying Rate Limiting

Doesn't need to apply to the whole API — e.g. `POST /login` might have a strict limit while `GET /products` has a different one. The demo applies middleware broadly for simplicity; in a real project, apply it where appropriate.

## 40. Redis Pub/Sub

```
Publisher → Channel → Subscriber
```
- **Publisher** — sends a message
- **Subscriber** — listens for messages
- **Channel** — the topic/mediator shared by publishers and subscribers

## 41. Pub/Sub Example

```
Publisher: PUBLISH notification "New course available"
Subscriber: SUBSCRIBE notification
```
```
Admin/API → Publisher → Redis channel → Subscriber → Notification handler
```

## 42. Pub/Sub Requires Two Clients

The subscriber enters subscription mode and listens, while the publisher needs to send messages — so you create separate Publisher and Subscriber Redis clients.

## 43. Pub/Sub Flow

```
Subscriber: SUBSCRIBE notifications
Publisher:  PUBLISH notifications message
```
Redis delivers to all active subscribers on that channel.

## 44. Subscriber Must Be Active

Pub/Sub is live messaging — the subscriber must be active **before** the publisher sends the message. If nobody's listening at that moment, a subscriber that comes online later will not receive that old message. Redis Pub/Sub doesn't replay history.

## 45. Pub/Sub Does NOT Permanently Store Messages

Redis Pub/Sub is live messaging, not a persistent message queue. Messages are delivered to active subscribers only — not stored as durable history for future subscribers.

## 46. Pub/Sub in the Project

```
Admin/API → Create notification → Publisher → Redis notification channel → Subscriber → Receive notification
```

## 47. Pub/Sub Lifecycle

```
Create publisher & subscriber
       ↓
Connect both
       ↓
Subscriber subscribes to channel
       ↓
Publisher publishes message
       ↓
Subscriber receives message
       ↓
Unsubscribe
       ↓
Quit both clients
```

## 48. The Big Picture

```
                         REDIS
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ↓                   ↓                   ↓
    DATA TYPES          CACHING            RATE LIMITING
       │                   │                   │
       ├─ String           ├─ Cache hit        ├─ INCR
       ├─ Hash             ├─ Cache miss       ├─ EXPIRE
       ├─ List             ├─ Cache-aside      └─ Fixed window
       ├─ Set              ├─ TTL
       └─ Sorted Set       └─ Invalidation
                           │
                           ↓
                        PUB/SUB
                           │
                     ┌─────┴─────┐
                     ↓           ↓
                 Publisher    Subscriber
```


# Redis Presence & Pub/Sub — Notes

**Sources:** Redis EXPIRE/SET docs, Redis Pub/Sub docs, Redis SADD/SREM/SCAN docs

## What problem this solves

Presence — knowing who's currently online or actively viewing something — is inherently short-lived, frequently-changing data. Tracking it in Postgres would mean constant writes for a value nobody needs history of. Redis fits because presence is exactly what it's built for: fast, ephemeral, TTL-expirable.

The harder problem underneath isn't "where to store it" — it's that presence is usually implemented as "mark online on connect, mark offline on disconnect," and **disconnect events are unreliable**. A closed laptop lid, a dropped WiFi connection, or a crashed browser tab never sends a clean disconnect signal. A system relying only on explicit disconnect events will show that user as online indefinitely.

## Core mechanism

**Heartbeat + TTL, not connect/disconnect events.** The client periodically (e.g. every 15s) tells the server "I'm still here." Each heartbeat resets a Redis key's TTL via `SET key value EX ttlSeconds`. If the heartbeats stop — for ANY reason, clean or not — the key simply expires on its own. No disconnect event required; absence of a heartbeat within the TTL window *is* the offline signal.

**TTL sizing.** The TTL should be a small multiple of the heartbeat interval (commonly ~3x), not equal to it. A TTL equal to the heartbeat interval means any single delayed heartbeat — ordinary network jitter, not an actual disconnect — flips the user to offline and back, producing flickering false-negatives.

**Broadcasting changes: Pub/Sub.** `PUBLISH channel message` / `SUBSCRIBE channel` is fire-and-forget: Redis delivers a published message to whoever is subscribed at that exact moment, with no persistence and no delivery guarantee. A subscriber that connects a moment after a publish simply never receives that message — there is no history to catch up on. This is the correct fit for presence changes specifically, since presence only cares about "right now," not "what happened while I was away."

**Avoiding the `KEYS` anti-pattern.** `KEYS pattern*` is O(N) over the entire keyspace and blocks Redis's single event loop while it runs — harmless with a handful of local test keys, dangerous in production with a large keyspace. The correct pattern for "who's currently present" is maintaining an explicit Set (`SADD`/`SREM`/`SMEMBERS`) alongside the TTL keys, kept in sync as users join/heartbeat/expire, rather than scanning for matching keys on every read. `SCAN` exists as a safer, non-blocking alternative to `KEYS` if iteration is ever genuinely needed.

**Keeping the Set in sync with TTL expiry.** Redis doesn't natively fire an application-visible event when a key expires unless keyspace notifications are explicitly enabled. Two viable approaches:
1. Enable keyspace notifications and listen for expired-key events to trigger a `SREM` — real-time cleanup.
2. Lazily check each Set member's TTL key when reading "who's present" and `SREM` any that have already expired — simpler, at the cost of the Set being very slightly stale between reads until the next read triggers cleanup.

## Security / correctness considerations

- Heartbeat-based presence has no concept of "verified" absence — a user who's still connected but whose heartbeat is silently dropped by a flaky network will incorrectly show as offline. This is a tradeoff, not a bug: perfect accuracy would require a stronger guarantee than UDP-like heartbeats can offer.
- Pub/Sub messages are never persisted — if the process handling broadcast delivery restarts or crashes between a publish and its intended subscribers receiving it, that message is gone permanently. Not a concern for presence (the next heartbeat/publish supersedes it anyway) but would be a serious flaw if Pub/Sub were used for anything requiring guaranteed delivery.

## Common misconceptions

- **"Disconnect events are a reliable way to track presence."** They aren't — TCP/WebSocket disconnects aren't always cleanly signaled (closed laptop lids, killed processes, network partitions). TTL-based "prove you're alive" is more robust than "tell me when you leave."
- **"Pub/Sub is a message queue."** It isn't — a queue implies persistence and guaranteed eventual delivery even to a consumer that wasn't listening yet. Pub/Sub guarantees neither. Genuine queue semantics need a different tool (BullMQ, covered in a later week).
- **"`KEYS` is fine for finding all presence keys since it's simple."** It's simple, but it blocks the entire single-threaded Redis server for the duration of the scan — fine for a handful of local keys, a real problem once the keyspace is large. An explicit Set avoids this entirely by making "who's present" an O(1) `SMEMBERS` read instead of a full keyspace scan.

## One line worth remembering

Presence isn't "track when someone leaves" — it's "track proof someone is still there, and let absence of proof mean they've left." That reframing is the entire reason heartbeat+TTL beats connect/disconnect events.

---

## My understanding before reading

I assumed presence tracking would work by setting a flag when someone connects and clearing it when they disconnect — something like an `isOnline` boolean tied to the WebSocket connection lifecycle, with Redis just being a fast place to store that boolean instead of hitting Postgres on every check.

## What I got right vs missed

- **Correct:** Redis being a good fit for this because of its speed and TTL support; general shape of "store presence separately from the main DB."
- **Missed:** the entire premise that clean disconnect events can't be trusted — hadn't considered the closed-laptop-lid case at all until tracing it by hand on Day 1. Reframed the whole design from "track connect/disconnect" to "track proof of life."
- **Missed:** TTL sizing relative to heartbeat interval — assumed TTL should just roughly match the heartbeat interval, didn't anticipate the false-negative flickering that causes.
- **Missed:** Pub/Sub's complete lack of persistence — assumed a late subscriber would at least get the most recent message, not nothing. Tested this directly (start a subscriber after a publish) rather than trusting the docs, and confirmed it really does get nothing.
- **Missed:** the `KEYS` anti-pattern entirely — first instinct for "who's present" was exactly `KEYS presence:*`, only learned why that's wrong at scale after building it that way first (deliberately, to feel the problem before fixing it).

## Common mistakes (for future me)

- Never reach for `KEYS pattern*` in anything beyond a quick local debug session — maintain an explicit Set for anything read frequently in production.
- Don't set TTL equal to the heartbeat interval — use a multiple (≈3x) to absorb normal network jitter without false offline flickers.
- Don't assume Pub/Sub has any memory — a subscriber that wasn't listening at publish time gets nothing, ever, for that message. If a "catch-up" requirement ever appears, that's a signal Pub/Sub is the wrong tool, not a sign to add persistence to it.
- Remember Redis doesn't auto-notify on key expiry unless keyspace notifications are explicitly turned on — don't assume an app-level hook fires "for free" when a TTL key disappears.

## Related topics

- `idempotency-keys` — same `SET ... EX` primitive, different purpose: claiming an operation once there vs proving continued liveness here.
- `rate-limiting` — same Redis instance, same general pattern of ephemeral per-identifier state with a TTL, different problem again.
- `websockets` (next) — this week's presence Set and Pub/Sub channel become the live data broadcast over an actual socket connection instead of terminal test scripts; the `@socket.io/redis-adapter` used there is itself built on this same Pub/Sub primitive.
