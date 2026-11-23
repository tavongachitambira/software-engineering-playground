# Notes: Optimistic Locking & Concurrency Control

> Draft written from the Week 5 plan; rewrite anything in your own words. The checkpoint answer is at the bottom.

## Where this sits

Week 4 pushed changes to every connected client in real time, so two people looking at the same incident is now the normal case. Until this week every write was last-write-wins because nothing ever checked. First topic that needs a real relational DB: the earlier examples use Redis or in-memory arrays, and an in-memory array can't show this. Node is single-threaded, so "check the version, then write" is atomic by accident whenever there is no `await` between the two.

## 1. The lost update

- Two clients read v3. Both edit. Both save. The second save silently replaces the first, because its write was built on a copy that was already stale.
- Every request returns 200 and nothing logs an error. It surfaces later as "someone's change disappeared".
- Fix: the write carries the version it was based on (`baseVersion`), and the database only applies it if the row is still at that version.

## 2. Version column as compare-and-swap

- One statement: `UPDATE ... SET version = version + 1 WHERE id = $4 AND version = $5 RETURNING *`.
- 1 row back = won. 0 rows = id unknown (404) or version moved (409); one follow-up `SELECT` decides which and fetches the current row.
- Postgres READ COMMITTED does the hard part: the second concurrent `UPDATE` waits on the row lock, and when the first commits it re-evaluates its `WHERE` against the new row. Confirmed in the Postgres docs ("Transaction Isolation", Read Committed). Under REPEATABLE READ it would raise a serialization error instead.
- `version = version + 1` is computed by the database, not the app, so two writers can't compute the same next version.

## 3. Optimistic vs pessimistic

- Pessimistic needs a lock held across the user's editing time. A DB row lock lives inside one transaction, so it can't span several HTTP requests and minutes of typing. For humans it becomes an app-level lock with an expiry, with all the abandoned-tab problems that brings.
- Optimistic holds nothing and pays only when a conflict happens. Good fit for SyncBoard's incident edits; bad fit for a hot counter, where almost every write would be rejected.

## 4. HTTP shape

- Built what the roadmap says: `baseVersion` in the body, 409 on mismatch, `current` row in the 409 body.
- Alternative: `ETag` + `If-Match`, 412 on mismatch, 428 if the header is absent. More "correct" HTTP, more plumbing. Worth revisiting if other clients (not just SyncBoard's own) ever call this API.

## 5. Things that bit or would have bitten

- **My Week 5 PDF said a pool of size 1 hides the race. It doesn't.** I ran the race script with `DB_POOL_MAX=1` and the naive route still lost an edit in 50/50 rounds. `pool.query()` releases the connection after every statement, so the `SELECT`s and `UPDATE`s of two requests still interleave. (What *would* hide it is holding one connection across check and write, e.g. a transaction on a single checked-out client with `max: 1`. That serializes the requests in the app.) The PDF has been corrected.
- **The naive route bumps the version twice.** Both racers read v1, both write `version = version + 1`, so the final row is v3 with only the later body. Version history looks perfectly healthy while an edit is gone, which is the nasty part.
- **Needed a widened gap to make the race reliable.** `updateDocumentNaive()` sleeps 50ms between check and write. Without it the race only hits occasionally and a green test means nothing. The guarded route needs no such help because it has no gap.
- **Malformed ids.** A non-UUID id passed to a `uuid` column makes Postgres throw (a 500), not return no rows. The store validates the id shape first and treats malformed as 404.
- **The API still needs Redis** for this topic even though Postgres is the star: the global rate limiter and the Week 4 socket plugin both connect to it at boot.
- **`pool.end()` on close.** The route plugin closes the pool in an `onClose` hook so the process exits cleanly.

## Deviations from the Week 5 plan

1. **Store layer.** The plan put the SQL in `routes/documents.ts`. Followed the repo's pattern instead (`lib/presence/store.ts`) and put it in `lib/documents/store.ts`, with the routes thin.
2. **Both routes kept mounted.** The naive `PUT /:id/naive` stays in the codebase so the race script can show it failing on every run. It is labelled flawed in the code and README.
3. **Extra route validation.** Non-string title or body, a non-integer `baseVersion`, and malformed ids are rejected (400/404) rather than reaching the database.
4. **`DB_POOL_MAX` env var** added to `lib/db.ts` purely to run the pool-size experiment above.
5. **Test plan became one script.** `optimistic-lock-race.ts` covers the basic contract, error classification, client recovery and both races, not just the race.
6. **Stretch goals not built:** emitting `incident:updated` with the new version on a successful write, and extending the Week 2 idempotency plugin to `PUT`.

## Open questions / not done

- **Idempotent PUT retries.** A client times out on a `PUT` that actually committed, retries with the old `baseVersion`, and gets a 409 against its own write. An idempotency key would replay the original 200, but `plugins/idempotency.ts` only handles `POST` (`if (req.method !== 'POST') return;`). The 409 body does give the client enough to notice `current.updated_by` is itself, but that is a workaround.
- **Broadcasting the new version.** After a successful write, `emitIncidentUpdated()` (Week 4) could carry `version`, so other clients know their base is stale before they submit. Not wired up; the documents here aren't incidents yet.
- **Version per row vs per field.** Two users editing different fields still conflict. Splitting append-only data out (timeline notes as their own rows) removes most of the contention without field-level versions. Anything finer than that is merge territory, which leads straight into Week 7's CRDT comparison.
- **Postgres's own `xmin` system column** is sometimes used as a free concurrency token (some ORMs do this). Didn't explore its caveats; an explicit `version` is easier to reason about and to expose in an API.
- **Authorization.** Any authenticated user can write any document. The JWT has `organizationId` and `role`, but the toy table has no owner or org column. Same gap as Week 4's room joins.

## How I tested it

Postgres 16 (installed from apt, same major version as the `postgres:16` image in `docker-compose.yml`), Redis, and the API on :4100. `docker compose` itself was **not** run: the sandbox has no Docker daemon, so I applied `schema.sql` with `psql` instead.

`optimistic-lock-race.ts`, 50 rounds per route:

- **Basic contract:** create gives v1; guarded write gives v2 and `updated_by` = JWT `sub`; a stale write gives 409 with `current.version` = 2 and `current.updated_by` of the winner, and the row is unchanged.
- **Classification:** unknown id and malformed id give 404 (not 409); missing or non-integer `baseVersion` gives 400.
- **Client recovery:** reapplying the edit on top of `current` and retrying with its version gives 200.
- **Naive route:** both writers got 200 in 50/50 rounds, final version 3, one edit lost. The test asserts this, so a green run proves it can detect the bug.
- **Guarded route:** exactly one 200 and one 409 in 50/50 rounds, final version always 2 (never 3), stored body always the winner's.
- **Pool size 1:** same results as above (see section 5).

Typecheck: `pnpm --filter api typecheck` is still broken for the same pre-existing tsconfig reason noted in Week 4, so the new files were checked with explicit `tsc --strict` flags; clean.

## Notes checkpoint

**What should the client do on a 409: silently retry, or show the user both versions to merge by hand? Argue for SyncBoard.** *(draft answer)*

**A "silent retry" is only safe if it isn't really a retry.** Resending the same body with the new `baseVersion` is last-write-wins again: the version check passes, and the other writer's change is overwritten without anyone seeing it. That defeats the whole mechanism. The only safe silent path is a *rebase*: take `current` from the 409, reapply the user's actual edit (the fields they changed) on top of it, and send that with `baseVersion = current.version`. That is only correct when the two edits touched different fields.

**Cost of being wrong is asymmetric.** Interrupting a user costs a few seconds. A wrong auto-merge silently loses or corrupts incident data during an active incident, when people are making decisions from it. So the default should lean toward asking.

**It depends on the field.**
- **Structured fields (status, severity, assignee):** these are decisions. If Alice marks the incident Resolved while Bob, who hasn't seen it, sets it to Escalated, one of them is wrong and a human needs to see that. Never auto-merge; show the conflict.
- **Free text (description):** show both versions side by side, highlight what changed, let the user choose or combine. Auto-merging prose by guesswork is how sentences get mangled.
- **Disjoint fields (Alice edits the title, Bob the assignee):** safe to auto-rebase, because the edits don't overlap. This is the one place silent retry earns its keep.
- **Append-only data (timeline notes):** shouldn't conflict at all. Store them as separate rows and insert; no version check needed.

**Contention changes the picture.** A quiet incident has one editor and conflicts are almost nonexistent, so the cost of the 409 path barely matters. An active incident with five responders makes the incident row hot, and then the real fix is structural: shrink what the lock guards (move notes out, keep only the few structured fields versioned) rather than making the conflict UI smarter. If conflicts are still frequent after that, optimistic locking is the wrong tool for that data and you are heading toward merging (Week 7's CRDTs).

**So for SyncBoard:** versioned writes with a 409 that returns the current row; auto-rebase only when the changed fields are disjoint; for anything overlapping, show the user both versions; and keep timeline notes out of the locked row entirely.
