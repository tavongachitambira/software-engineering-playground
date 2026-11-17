# Notes: WebSockets & Socket.io Fundamentals

> Draft written from the Week 4 plan; rewrite anything in your own words. The checkpoint answer is at the bottom.

## Where this sits

Weeks 1-3 (rate limiting, idempotency, Redis presence) were stateless-request concerns. This is the first topic where the connection is stateful. Week 3's presence set and TTL heartbeat get reused here, driven by the socket lifecycle instead of a test script.

## 1. The handshake

- Raw WebSocket: `GET` with `Upgrade: websocket` + `Connection: Upgrade`, server replies `101 Switching Protocols`, TCP stays open for full-duplex frames.
- It starts as HTTP, so the opening request still passes through header/cookie/CORS-style checks. The upgrade does not bypass them.
- Socket.io is not raw WebSocket. It runs its own protocol, starts on HTTP long-polling and upgrades by default, and delivers the client's `auth` object in its own connect packet. `io.use()` runs at that point.
- Rejecting in middleware (`next(new Error(...))`) means the socket never reaches `connection`, and the client sees `connect_error`.

## 2. Full-duplex vs request/response

- HTTP: client asks, server answers.
- WebSocket: either side sends any time. The server can notify a client with no preceding request.
- That is the entire reason SyncBoard needs it: other users' incident updates must reach you without polling.

## 3. Socket.io specifics

- **Namespace**: separate channel multiplexed over one connection.
- **Room**: server-side tag. Clients can't create or list rooms; they can only ask the server to join them. So *the server* must decide whether a join is allowed.
- **Redis adapter**: publishes each emit over Pub/Sub; every instance delivers to its own local members. `fetchSockets()` and `in(room)` also go through it, which is how the demo route reports cluster-wide room size.
- SyncBoard already runs `@socket.io/redis-adapter` in production. The point here was seeing why, by running two instances and watching an emit on one reach a socket on the other (`websocket-smoke.ts`).

## 4. Heartbeats: two different ones

| | Engine.io ping/pong | Presence heartbeat |
|---|---|---|
| Purpose | Is this transport alive? | Is this *user* still looking at this *incident*? |
| Owner | Socket.io, automatic | Client emits `presence:heartbeat` every 15s |
| On failure | `disconnect` with `ping timeout` (about 45s with default settings) | Redis TTL key expires after 45s |

Don't merge them. Presence is per-incident and survives a socket reconnect; the transport heartbeat is per-connection. `disconnect` does **not** touch presence for exactly that reason.

## 5. Things that bit or would have bitten

- **A TTL key expiring emits nothing.** Week 3's presence store cleans up lazily on read, so nobody told the room that someone left. The Week 4 test plan expects a `presence:changed` event on expiry, which requires something to go looking. Options: keyspace notifications (needs Redis config, delivered to every subscriber) or a sweeper. I built a 5s sweeper.
- **Sweeper must be atomic and exactly-once.** With N API instances all sweeping, naive code announces each expiry N times. `sweepExpired()` runs a tiny Lua script: `SREM` only if the TTL key is gone. `SREM` returns 1 for exactly one caller, and only that caller emits. Atomic also closes the race where a heartbeat lands between a separate `EXISTS` and `SREM`.
- **`heartbeat()` now returns a boolean.** `SET key v EX 45 GET` returns the previous value; `null` means the user just came online. Without that, either every 15s heartbeat broadcasts "online" or nothing does after a lapse.
- **Static `auth` object resends a stale token on reconnect.** Use a function.
- **Sticky sessions.** Polling-first transport means one session's requests must reach the same instance. The Redis adapter doesn't fix that. Either sticky routing, or `transports: ['websocket']` both sides.
- **Multi-tab edge**: same user, two tabs, one tab sends `incident:leave`. Presence is removed and "offline" is announced although the other tab is live; the other tab's next heartbeat (≤15s) restores it and announces "online". Flicker, not a bug. Fixing it means per-socket presence entries instead of per-user.

## Deviations from the Week 4 plan

1. **Import path.** The plan says `routes/auth/jwt/verify`; in this repo `verifyAccessToken` lives in `routes/auth/jwt-auth.ts`. Imported from there, no second verifier.
2. **Presence call order.** Plan says `markOnline(userId, incidentId)`; the existing store is `heartbeat(incidentId, userId)`. Used as-is.
3. **Presence starts on `incident:join`, not on `connection`.** A connection has no incident yet, and presence is keyed per incident.
4. **Added a sweeper and `sweepExpired()`** (see section 5); the plan's last test step needs it.
5. **Added expiry cap**: socket disconnects at the token's `exp`. Not in the plan; it is the mitigation for the checkpoint question.
6. **Typed events** (`types/socket.ts`) and room-id validation (non-empty string, ≤128 chars). Handshake proves identity, not that the arguments are sane.
7. **Example is a separate runnable package** (`@topics/websocket-fundamentals`) with its own throwaway RS256 keypair, so it runs without Redis or env keys.

## Open questions / not done

- **Authorization on join.** Any authenticated user can join any `incident:<id>` room, including other organizations'. The JWT carries `organizationId`, but the toy incident store has no org field to check against. Real fix: look up the incident and compare org (and role) in `incident:join`. Cheap defense in depth: namespace rooms as `org:<id>:incident:<id>`.
- **Revocation.** Disconnecting at `exp` caps the window but doesn't end it on demand. To kick a user immediately (fired, role change), join each socket to a `user:<sub>` room and call `io.in('user:<sub>').disconnectSockets(true)` from the revocation path. Not built.
- **Rate limiting socket events.** Week 1's limiter guards HTTP. A client can still spam `presence:heartbeat` or `incident:join`. Needs a per-socket limiter.
- **Missed events during a gap.** Reconnecting clients miss whatever was emitted while offline (and Pub/Sub has no replay, same lesson as Week 3). Socket.io has a connection-state-recovery option; worth reading whether it fits behind the Redis adapter, or whether clients should just refetch on reconnect.

## How I tested it

- `example/smoke-test.ts` (standalone server): valid handshakes, missing and tampered token rejected, room members receive and a non-member does not, leaving a room stops delivery. Passes.
- `apps/api/src/scripts/websocket-smoke.ts` (two API instances, one Redis): handshake accept/reject; a REST-triggered emit on instance A reaches a room member connected to instance B, and not a non-member; `roomMembers` counts across both instances; ungraceful transport drop leaves presence intact, offline is announced about 49s later (TTL 45s + sweep interval), exactly once with both instances sweeping. Passes.

## Notes checkpoint

**Why is handshake-time auth (verified once per connection) the right tradeoff for a persistent connection, instead of re-verifying the JWT on every message?** *(draft answer)*

**What per-message verification costs.** An RS256 verify is cheap on its own, but it is CPU on every inbound frame for the life of every connection, and the client has to attach the token to every event, so you pay bandwidth and payload bloat too. At incident-fan-out scale (thousands of connections, heartbeats every 15s) it is a constant tax for no added protection.

**Why it buys nothing.** The token authenticates the *party that opened the connection*. Once the connection is up over TLS, frames on it can only come from that party. An attacker who can inject frames into the TCP/TLS session has already beaten the token anyway. Per-message tokens re-prove an identity the transport already pins.

**The risk actually accepted: the connection outlives the token.** A token is valid for 15 minutes; a socket can live for hours. During that gap an expired token, a revoked session, a user who has since been fired or demoted, all still receive live incident data. That is a realistic attack (stolen laptop, ex-employee with a tab left open), not a theoretical one. A second, separate risk: authorization drift. The handshake says who you are, not what you may see, so access checks belong at `incident:join`, not just at connect.

**Mitigations in practice.**
1. Disconnect at token `exp`, and have the client reconnect with a fresh token (implemented in `plugins/socket.ts`).
2. Authorize each room join against the incident's org/role (not yet implemented, see open questions).
3. A server-side kick path (`user:<sub>` room + `disconnectSockets`) for immediate revocation.
4. `wss://` only, keep the token out of the URL (use `auth`), and check `Origin` if cookies are ever used for socket auth, since browsers don't apply CORS to WebSockets (cross-site WebSocket hijacking).
5. Short access-token lifetime, which already bounds everything above.

So: verify once, because the per-message alternative is expensive and protects nothing the transport doesn't already, then actively shrink the window the connection can outlive the credential.
