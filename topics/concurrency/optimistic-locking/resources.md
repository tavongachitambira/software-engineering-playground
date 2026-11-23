# Resources: Optimistic Locking & Concurrency Control

## Official documentation
- [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html): the Read Committed section describes exactly what a concurrent `UPDATE` does (waits, then re-evaluates its `WHERE` against the newer row); the Repeatable Read section describes the `could not serialize access due to concurrent update` error you would get instead.
- [PostgreSQL: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html): row-level locks and `SELECT ... FOR UPDATE`, i.e. what the pessimistic option actually is.
- [PostgreSQL: UPDATE](https://www.postgresql.org/docs/current/sql-update.html): `RETURNING`, and how to read the affected row count.
- [node-postgres: Pooling](https://node-postgres.com/features/pooling): `pool.query()` checks a client out and releases it after every statement. That is why the naive route's separate `SELECT` and `UPDATE` still interleave across requests even with `max: 1`.

## Articles / patterns
- [Martin Fowler: Optimistic Offline Lock](https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html): the canonical description; the version-column variant is what this topic builds.
- [Martin Fowler: Pessimistic Offline Lock](https://martinfowler.com/eaaCatalog/pessimisticOfflineLock.html): read beside it for the contrast, and for why a DB row lock cannot span user think time.

## RFCs / specs
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110): 409 Conflict (section 15.5.10), 412 Precondition Failed (15.5.13), `If-Match` (13.1.1), `ETag` (8.8.3). The standards-flavoured version of this topic's `baseVersion` field.
- [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585): defines 428 Precondition Required, for rejecting writes that carry no precondition at all.

## In-repo
- [idempotency-keys](../../reliability/idempotency-keys/resources.md): the lost-response retry case where the two mechanisms meet.
- [websocket-fundamentals](../../realtime/websocket-fundamentals/resources.md): pushing the new version to other clients.

(General-purpose database and concurrency resources beyond this topic go in `/resources/` per repo convention.)
