---
title: "Optimistic Locking & Concurrency Control"
category: concurrency
slug: optimistic-locking
status: draft
difficulty: intermediate
related: [idempotency-keys, websocket-fundamentals, redis-presence]
last-updated: 2026-11-22
---

# Optimistic Locking & Concurrency Control

Maps to: SyncBoard's optimistic locking on incident edits. Week 5 of 8 in the post-auth backend roadmap.

## What is it?

A way to stop two concurrent writers from silently overwriting each other without holding any lock while a human is editing. Every row carries a `version`. A client sends back the version it last read (`baseVersion`), and the database applies the write only if the row is still at that version. If not, the write is rejected (409) and the client has to look at what changed. "Optimistic" because it assumes conflicts are rare and pays only when one actually happens.

## Why does it exist?

The default behaviour of read, modify, write is **last write wins**, and it is silent:

| Time | Alice | Bob | Row |
|---|---|---|---|
| t1 | reads v3 | | v3 |
| t2 | | reads v3 | v3 |
| t3 | saves new title | | v4 (Alice's title) |
| t4 | | saves new description, built on the v3 copy | Bob's whole row; Alice's title is gone |

No error, every request returns 200. Week 4 made this the normal case in SyncBoard: two responders see the same incident arrive over `incident:updated` and both start editing.

## When should I use it?

- Editing a shared record where conflicts are possible but uncommon: incident fields, documents, settings pages.
- Anywhere a human holds a form open for minutes. A DB row lock lives inside one transaction and cannot span that.
- **Not** for hot rows with many tiny concurrent writes (counters, stock, balances). There an atomic `SET x = x - 1` or a short pessimistic lock is the right tool, because nearly every write would be rejected.

| | Optimistic | Pessimistic |
|---|---|---|
| Assumes | Conflicts are rare | Conflicts are likely |
| Mechanism | Version check at write time, nothing held while editing | Lock before editing, held until save (`SELECT ... FOR UPDATE`, or an app-level lock) |
| Cost when contended | A rejected write; the user redoes work | Other users block |
| Failure mode | Wasted effort | A lock held by an abandoned tab until it times out |

## How it works

**The version column is a compare-and-swap, and it must be one statement:**

```sql
UPDATE documents
   SET title = $1, body = $2, version = version + 1, updated_by = $3, updated_at = now()
 WHERE id = $4 AND version = $5      -- $5 = the version the client last read
RETURNING *;
```

- **1 row back:** the write won, and the row carries the new version.
- **0 rows back:** the id does not exist (404) or the version moved on (409). One follow-up `SELECT` tells which and fetches the current row for the response. That query only classifies the failure; it is not part of the check.
- **Why a separate `SELECT` then `UPDATE` is wrong:** another request can land between them (check-then-act), which is the exact race being closed.
- **Why it is safe at Postgres's default isolation (READ COMMITTED):** a second concurrent `UPDATE` of the same row waits for the first transaction, and if the first commits, re-evaluates its `WHERE` against the new row version. `version = $5` is now false, so it matches 0 rows. No explicit transaction and no `FOR UPDATE` needed. (Under REPEATABLE READ the second writer would instead get a `could not serialize access due to concurrent update` error and need retry logic. Not needed here.)

**HTTP contract.** This topic follows the roadmap: `baseVersion` in the body, **409 Conflict** on mismatch, with the current row (and `updated_by`) in the response so the client can reapply its edit without another GET. The standards-flavoured alternative is `ETag` on reads plus `If-Match` on writes, with **412 Precondition Failed** on mismatch and **428 Precondition Required** if the header is missing.

**Client recovery.** After a 409 the client takes `current` from the response, reapplies its edit on top of it, and retries with `baseVersion = current.version`. Resending the *same stale body* with just the new version number is last-write-wins again and defeats the lock.

## How to implement it

Runnable end to end (see [`example/README.md`](./example/README.md)):

- `example/docker-compose.yml` + `example/schema.sql`: Postgres 16 and the `documents` table.
- `apps/api/src/lib/db.ts`: shared `pg` pool.
- `apps/api/src/lib/documents/store.ts`: `updateDocument()` (the guarded `UPDATE`) and `updateDocumentNaive()` (the check-then-act bug, kept on purpose).
- `apps/api/src/routes/documents.ts`: `POST /`, `GET /:id`, `PUT /:id` (guarded), `PUT /:id/naive` (flawed), mounted at `/topics/optimistic-locking/documents`.
- `apps/api/src/scripts/optimistic-lock-race.ts`: the Week 5 test plan as code, including the concurrent race against both routes.

Build order that works: get the naive route to lose an update first, then fix it, so the guard has something to prove itself against.

## Common mistakes

- **`SELECT` the version, compare in app code, then `UPDATE` without the guard.** Looks right, races. The naive route in this topic is exactly that.
- **Bumping the version in app code (`version = $newVersion`) instead of `version = version + 1`.** Two writers can compute the same new version.
- **Treating 0 rows as always 409.** A missing id is a 404. Classify with one extra read.
- **Silent retry with the same stale body.** Re-sending your old edit with the new version number overwrites whatever the other writer did. A safe retry has to reapply the edit on top of the current state, or ask the user.
- **Returning a bare 409 with no current state.** Forces a second round trip and gives the user nothing to merge against.
- **Version per row when users edit different fields.** Two people changing different fields still conflict. Fine for rarely-contended records; for hot rows, move append-only data (timeline notes) into its own table so only structured fields need the lock.
- **Retrying a `PUT` whose response was lost.** The first attempt committed, so the retry carries a stale `baseVersion` and gets a 409 against its own write. An idempotency key would replay the original 200 instead. Note the Week 2 plugin only acts on `POST` (see `plugins/idempotency.ts`), so this needs work to cover `PUT`.
- **A race test that has never been seen to fail.** If it passes against the broken version too, it proves nothing. Keep the naive route and its widened gap so the test is able to fail.

## Related topics

- [idempotency-keys](../../reliability/idempotency-keys/README.md): dedupes retries of the *same* request; optimistic locking rejects *different* requests built on stale state. They interact on lost-response retries (see above).
- [websocket-fundamentals](../../realtime/websocket-fundamentals/README.md): broadcasting `incident:updated` with the new `version` lets other clients learn their base is stale before they submit.
- [redis-presence](../../reliability/redis-presence/README.md): presence tells you who else is on the incident, which is when a conflict is most likely.

## Resources

See [resources.md](./resources.md).
