# Redis Presence & Pub/Sub

## What is it?

Presence tracking answers "who's online / actively viewing this incident
right now" — data that's short-lived and constantly changing, a poor fit
for Postgres. The harder problem isn't where to store it; it's that the
obvious naive approach — mark someone online on connect, offline on
disconnect — is fragile. A closed laptop lid, a dropped WiFi connection,
or a crashed tab never fires a clean disconnect event, so that user would
show as online forever.

## How it works

**Heartbeat + TTL, not connect/disconnect events.** The client sends a
periodic "I'm still here" signal (every 15s here). Each heartbeat resets
a Redis key's TTL via `SET key value EX ttlSeconds`. If heartbeats stop —
for any reason, clean disconnect or not — the key simply expires. Absence
of proof of life within the TTL window IS the offline signal; nothing has
to explicitly declare someone offline.

**TTL sizing.** Set to roughly 3x the heartbeat interval (45s here, for a
15s heartbeat) — enough to absorb ordinary network jitter without one
missed heartbeat flipping someone to offline and back.

**Broadcasting changes via Pub/Sub.** `PUBLISH`/`SUBSCRIBE` is
fire-and-forget: no persistence, no delivery guarantee, no history. A
subscriber that connects after a publish already happened simply never
sees that message. This is the right tool here specifically because
presence only cares about "right now" — nobody needs to catch up on who
was online five minutes ago.

**Avoiding the `KEYS` anti-pattern.** `KEYS pattern*` is O(N) over the
entire keyspace and blocks Redis's single-threaded event loop while it
scans — harmless with a handful of local keys, dangerous at real scale.
This implementation maintains an explicit Set (`SADD`/`SREM`/`SMEMBERS`)
of present user IDs per incident, updated on every heartbeat/leave,
instead of scanning for matching keys on every "who's present" read.

**Lazy cleanup, chosen over keyspace-notification-driven cleanup.**
Redis doesn't fire an application-visible event when a key expires unless
keyspace notifications are explicitly enabled. This implementation
instead checks each Set member's TTL key on read (`getPresentUsers`) and
removes any that have already expired — via a single pipelined batch of
`EXISTS` checks, not N sequential round trips. Tradeoff: the Set can be
slightly stale between reads (a member might still appear present for
up to one read-cycle after their TTL actually expired), in exchange for
not needing keyspace notifications configured and a simpler code path.

## How to implement it

- `lib/presence/store.ts` — `heartbeat` (refresh TTL key, add to Set,
  publish online event), `leave` (explicit removal + publish offline
  event), `getPresentUsers` (read Set, lazily prune expired members via
  a pipelined existence check).
- `routes/presence.ts` — three routes: `POST /:incidentId/heartbeat`,
  `POST /:incidentId/leave`, `GET /:incidentId/present`.
- `scripts/presence-subscriber.ts` — a standalone script (not part of the
  Fastify app) used to manually verify Pub/Sub delivery semantics by
  running it in a separate terminal and watching messages arrive live —
  this is how the "late subscriber gets nothing" claim was verified
  directly rather than taken on faith from the docs.

## Common mistakes I hit / deliberately guarded against

- **`KEYS` felt like the obvious first move for "who's present."** Worth
  building that way once to feel why it's wrong (blocks the single Redis
  thread, O(N) over the whole keyspace) before switching to a
  maintained Set — same "build the flawed version first" pattern used
  throughout this repo's other topics (rate limiting's fixed-window
  boundary bug, for instance).
- **TTL equal to the heartbeat interval causes flickering.** A single
  delayed heartbeat — ordinary jitter, not a real disconnect — would
  flip a user offline and back. Sizing the TTL as a multiple of the
  heartbeat interval absorbs that.
- **Assuming Pub/Sub has some replay/history.** It doesn't, at all — a
  subscriber that starts listening after a publish gets nothing for that
  message, permanently. Confirmed this directly with the standalone
  subscriber script rather than assuming.
- **Sequential existence checks instead of a pipeline.** Checking each
  Set member's TTL key one at a time would mean N round trips to Redis
  on every single "who's present" read. `redis.pipeline()` batches them
  into one round trip.

## Related topics
- `idempotency-keys` — same `SET ... EX` primitive, opposite intent:
  proving continued liveness here vs claiming an operation exactly once
  there.
- `rate-limiting` — same Redis instance, same general family of
  ephemeral per-identifier TTL state, different problem again.
- `websockets` (next) — this topic's presence Set and Pub/Sub channel
  become the live data broadcast over an actual socket connection
  instead of curl calls and a standalone terminal script.