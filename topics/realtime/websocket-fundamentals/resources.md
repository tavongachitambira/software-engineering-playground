# Resources: WebSockets & Socket.io Fundamentals

## Official documentation
- [Socket.io: Rooms](https://socket.io/docs/v4/rooms/): required reading for the room-per-incident pattern. Rooms are server-side only; a client cannot enumerate or join on its own authority.
- [Socket.io: Adapter](https://socket.io/docs/v4/adapter/): why `io.to(room).emit()` stops at the process boundary and what an adapter changes.
- [Socket.io: Redis adapter](https://socket.io/docs/v4/redis-adapter/): setup with separate pub/sub clients (`createAdapter(pubClient, subClient)`).
- [Socket.io: Middlewares](https://socket.io/docs/v4/middlewares/): `io.use()` and the handshake `auth` payload. Passing an error to `next()` becomes `connect_error` on the client.
- [Socket.io: Using multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/): sticky sessions, and why they are separate from the adapter.
- [Socket.io: Namespaces](https://socket.io/docs/v4/namespaces/)
- [Socket.io: How it works](https://socket.io/docs/v4/how-it-works/) and [Server options](https://socket.io/docs/v4/server-options/): the transport upgrade, plus `pingInterval` / `pingTimeout` that decide when a silent client is declared gone.
- [MDN: WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API): the raw browser API Socket.io wraps.

## Articles / blog posts
- [PortSwigger: Cross-site WebSocket hijacking](https://portswigger.net/web-security/websockets/cross-site-websocket-hijacking): why cookie-authenticated sockets need an Origin check, and why handshake-time token auth sidesteps it. Relevant to the notes checkpoint.

## GitHub repositories
- [socketio/socket.io](https://github.com/socketio/socket.io)
- [socketio/socket.io-redis-adapter](https://github.com/socketio/socket.io-redis-adapter): the `@socket.io/redis-adapter` package used in `apps/api`. Check its compatibility notes for ioredis.

## RFCs / specs
- [RFC 6455: The WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455): the opening handshake (section 4) is the `101 Switching Protocols` upgrade described in the README.

## In-repo
- [redis-presence](../../reliability/redis-presence/resources.md): Redis Pub/Sub delivery semantics (no history) apply to the adapter too. An emit published while an instance is disconnected from Redis is lost to that instance's sockets.
- [Keyspace notifications](https://redis.io/docs/latest/develop/use/keyspace-notifications/): the alternative to this topic's sweeper for learning that a presence key expired.

(General-purpose realtime resources beyond this topic go in `/resources/` per repo convention.)
