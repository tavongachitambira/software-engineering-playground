---
title: "WebSockets & Socket.io Fundamentals"
category: realtime
slug: websocket-fundamentals
status: draft
difficulty: intermediate
related: [redis-presence, http-auth-fundamentals, oauth2-oidc]
last-updated: 2026-11-17
---

# WebSockets & Socket.io Fundamentals

Maps to: SyncBoard's real-time incident updates. Week 4 of 8 in the post-auth backend roadmap.

## What is it?

A WebSocket is a long-lived, full-duplex TCP connection that starts life as an ordinary HTTP request. Either side can push a frame at any moment, with no request preceding it. Socket.io is a library on top of that: it adds rooms, namespaces, acknowledgements, automatic reconnection and a fallback transport, and it is **its own protocol**, so a plain `new WebSocket()` client cannot talk to a Socket.io server.

## Why does it exist?

HTTP is client-initiated. For "someone else just changed this incident" the only options were polling (wasteful, always stale) or long-polling (a hack around the same limit). A persistent connection lets the server push the moment something happens. The price: the connection itself is now **state**, which is the pivot from Weeks 1-3 (rate limiting, idempotency, presence were all stateless-request problems).

## When should I use it?

- Server-to-client pushes where latency matters: live incident updates, presence, collaborative cursors, chat.
- Many small events over time, where per-request HTTP overhead dominates.
- **Not** for one-off fetches, large uploads, or infrequent updates (SSE or plain polling is simpler and works through every proxy).

## How it works

**Handshake.** A raw WebSocket opens with `GET` + `Upgrade: websocket`; the server answers `101 Switching Protocols` and the socket stays open for frames. Because it begins as HTTP, headers, cookies and CORS-style checks still see the opening request. Socket.io by default starts on HTTP long-polling and upgrades to WebSocket, then runs its own `CONNECT` exchange on top, which is where `auth` is delivered.

**Namespaces and rooms.**

| Concept | What it is |
|---|---|
| Namespace | A separate channel multiplexed over one physical connection (`/incidents` vs `/admin`) |
| Room | A server-side tag a socket joins within a namespace. `io.to(room).emit(...)` reaches only members. Clients cannot list or create rooms; the server decides |
| Redis adapter | Without it, `emit` reaches only sockets held by *this process*. The adapter republishes each emit over Redis Pub/Sub so every instance delivers to its own local members. Required once you run more than one instance |

**Auth at handshake, not per message.** Verify the JWT once in `io.use()`, before the connection is accepted. After that the connection is the trust boundary. Cost of that tradeoff: the socket outlives the token, so cap it (this example disconnects at `exp`). See `notes.md` for the full argument.

**Presence rides on the socket lifecycle, with TTL as the only offline signal.** `incident:join` and `presence:heartbeat` refresh the Redis TTL key from [redis-presence](../../reliability/redis-presence/README.md). `disconnect` deliberately does nothing to presence. A sweeper announces expiries, because a key expiring emits nothing by itself.

## How to implement it

Two pieces, both runnable (see [`example/README.md`](./example/README.md)):

1. **`example/`**: standalone, memory-only server for the handshake + room mechanics. Two-tab browser harness plus an automated smoke test.
2. **`apps/api/`**: the real wiring.
   - `plugins/socket.ts`: Socket.io on Fastify's HTTP server, Redis adapter, `io.use()` JWT middleware (reuses `verifyAccessToken` from `routes/auth/jwt-auth.ts`, no second verifier), expiry cap.
   - `routes/incidents/socket.ts`: `incident:join` / `incident:leave` / `presence:heartbeat` handlers, presence sweeper, `emitIncidentUpdated()`.
   - `lib/presence/store.ts`: `heartbeat()` now reports whether it was a real offline-to-online transition; new atomic `sweepExpired()`.
   - `routes/websocket-demo.ts`: `POST /topics/websockets/incidents/:id/update` to trigger a room broadcast from REST.
   - `scripts/websocket-smoke.ts`: cross-instance test of the whole Week 4 test plan.

## Common mistakes

- **Per-message JWT verification.** Pays signature cost and bandwidth on every frame to defend against an attacker who would need to already control the TCP session.
- **Assuming `disconnect` always fires cleanly,** then driving presence from it. Laptop lids and dead Wi-Fi don't send goodbyes. Socket.io's own ping/pong eventually reports `ping timeout`, but your presence TTL should not depend on that.
- **Forgetting the adapter.** Rooms look fine on one process and silently drop messages the moment a second instance appears.
- **Thinking the adapter removes the need for sticky sessions.** With the default polling-first transport, the several HTTP requests of one session must hit the same instance. Pin them with sticky routing, or force `transports: ['websocket']` on client and server.
- **Token in the query string.** Ends up in access logs. Use the `auth` payload.
- **Static `auth` object on the client.** A reconnect after token expiry resends the stale token. Pass `auth` as a function so it runs on every connect.
- **Trusting handshake identity for authorization.** It proves who is connected, not that they may join `incident:123`. Validate room joins (the example documents this as a gap).
- **Expecting an event when a TTL key expires.** None is emitted; something has to sweep (or you enable keyspace notifications).

## Related topics

- [redis-presence](../../reliability/redis-presence/README.md): the TTL/heartbeat store this topic wires onto a real transport.
- [http-auth-fundamentals](../../authentication/http-auth-fundamentals/README.md): the RS256 access token being verified at handshake.
- [oauth2-oidc](../../authentication/oauth2-oidc/README.md): same idea of binding a session to a verified token once, then relying on that binding.

## Resources

See [resources.md](./resources.md).
