# Example: websocket-fundamentals

## What this demonstrates
A JWT-verified Socket.io handshake and room-per-incident fan-out (standalone), then the same wired to Redis presence and the Redis adapter inside `apps/api`.

## How to run it

**Standalone (handshake + rooms, no Redis):**
```bash
pnpm --filter @topics/websocket-fundamentals dev    # http://localhost:4200
pnpm --filter @topics/websocket-fundamentals test   # automated checks, server must be running
```
For the manual version open `http://localhost:4200` in two tabs: connect as different users, join the same incident, send an update, then try "tampered token", "no token" and "drop transport".

**In the API (adapter + presence), two instances, one Redis:**
```bash
redis-server &
export JWT_PRIVATE_KEY="$(cat private.pem)" JWT_PUBLIC_KEY="$(cat public.pem)"   # see routes/auth/jwt-auth.ts for keygen
PORT=4101 pnpm --filter api dev      # terminal 1
PORT=4102 pnpm --filter api dev      # terminal 2
pnpm --filter api exec tsx src/scripts/websocket-smoke.ts   # ~60s; SKIP_TTL=1 skips the presence-expiry wait
```
Manual fan-out from REST: `POST /topics/websockets/incidents/<id>/update` with a Bearer token.

## What to look at first
1. `example/server.ts`: `io.use()` handshake, then the join/leave/update handlers (~80 lines).
2. `example/client-test.html`: `auth` as a function so reconnects send a fresh token.
3. `apps/api/src/plugins/socket.ts`: adapter, the same handshake reusing `verifyAccessToken`, expiry cap.
4. `apps/api/src/routes/incidents/socket.ts`: rooms + presence + sweeper.
5. `apps/api/src/scripts/websocket-smoke.ts`: the Week 4 test plan as code.
