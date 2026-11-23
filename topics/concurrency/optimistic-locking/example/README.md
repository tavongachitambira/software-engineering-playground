# Example: optimistic-locking

## What this demonstrates
A `documents` table with a `version` column, a deliberately broken check-then-act `PUT` that loses updates, and the fix: one version-guarded `UPDATE` that returns 409 plus the current row. A script fires two writers at the same instant against each route.

## How to run it

```bash
# 1. Postgres 16 (schema.sql is applied on first init)
cd topics/concurrency/optimistic-locking/example
docker compose up -d
#    no Docker? any Postgres 16 works:
#    psql postgres://postgres:playground@localhost:5432/playground -f schema.sql

# 2. Redis is still needed: the API's global rate limiter and the Week 4 socket plugin use it
redis-server &

# 3. API (see routes/auth/jwt-auth.ts for generating the RS256 key pair)
export JWT_PRIVATE_KEY="$(cat private.pem)" JWT_PUBLIC_KEY="$(cat public.pem)"
pnpm --filter api dev                       # http://localhost:4100

# 4. The test plan as code (a few seconds)
pnpm --filter api exec tsx src/scripts/optimistic-lock-race.ts
```

Environment knobs: `DATABASE_URL` (default `postgres://postgres:playground@localhost:5432/playground`), `DB_POOL_MAX` (default 10), and for the script `BASE` and `ROUNDS` (default 50).

Expected output:

```
ok  create/read, guarded write bumps version, stale write -> 409 with current row
ok  unknown/malformed id -> 404, missing/non-integer baseVersion -> 400
ok  after a 409, reapplying on the returned current row and retrying succeeds
ok  NAIVE route: both writers got 200 in 50/50 rounds (final versions 3: bumped twice from v1, one edit silently lost)
ok  GUARDED route: exactly one 200 and one 409 in 50/50 rounds, final version always 2, stored body is the winner's
```

Manual version (needs a Bearer token from `/topics/jwt`): `POST /topics/optimistic-locking/documents` to create, then send two `PUT /:id` requests with the same `baseVersion` from two terminals.

## What to look at first
1. `apps/api/src/lib/documents/store.ts`: `updateDocument()` (the whole fix is the `WHERE id = $4 AND version = $5`), then `updateDocumentNaive()` beside it.
2. `apps/api/src/routes/documents.ts`: how 0 rows is classified into 404 vs 409, and what the 409 body carries.
3. `apps/api/src/scripts/optimistic-lock-race.ts`: the `race()` function, and why it asserts the naive route *fails*.
4. `schema.sql`: four lines of schema; `version` is the only thing that matters.
