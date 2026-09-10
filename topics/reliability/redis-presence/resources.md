# Resources: Redis Presence & Pub/Sub

## Official documentation
- [Redis: EXPIRE](https://redis.io/commands/expire/) and [SET](https://redis.io/commands/set/) — the `EX` option specifically, same primitive as idempotency keys, different purpose here (proving continued liveness vs claiming an operation once).
- [Redis: Pub/Sub](https://redis.io/docs/latest/develop/interact/pubsub/) — read the delivery-semantics section closely: no persistence, no history, a subscriber only gets what's published while it's actively listening.
- [Redis: SADD / SREM / SMEMBERS](https://redis.io/commands/sadd/) — the Set commands used to track "currently present users" without resorting to `KEYS`.
- [Redis: SCAN](https://redis.io/commands/scan/) — the safe, non-blocking alternative to `KEYS` if iteration over a keyspace is ever genuinely needed.
- [Redis: Keyspace notifications](https://redis.io/docs/latest/develop/use/keyspace-notifications/) — the mechanism for getting an application-visible event when a key expires, relevant to the "real-time cleanup" alternative to this topic's lazy-cleanup-on-read approach.

## Articles / blog posts
- None specific — this topic is built directly from the official Redis command docs rather than a third-party tutorial, since presence-via-TTL is a pattern assembled from a few primitives rather than a single documented recipe.

## GitHub repositories
- [ioredis](https://github.com/redis/ioredis) — the Node client used throughout this repo; its pipeline API (`redis.pipeline()`) is what makes the lazy-cleanup batch-existence-check in `getPresentUsers` a single round trip instead of N sequential calls.

## RFCs / specs
- None — Pub/Sub and TTL-based presence are Redis-specific mechanisms, not wire protocols with an independent spec.

(General-purpose reliability resources beyond this topic go in `/resources/` per repo convention.)