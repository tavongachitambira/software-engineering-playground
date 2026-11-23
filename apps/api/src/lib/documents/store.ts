import { pool } from '../db.js';

export interface Document {
  id: string;
  title: string;
  body: string;
  version: number;
  updated_by: string;
  updated_at: Date;
}

export type UpdateResult =
  | { status: 'ok'; document: Document }
  | { status: 'not_found' }
  | { status: 'conflict'; current: Document };

// A malformed id can never match a uuid column, and Postgres would throw
// "invalid input syntax for type uuid" (a 500) instead of returning no rows.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createDocument(title: string, body: string, userId: string): Promise<Document> {
  const { rows } = await pool.query<Document>(
    'INSERT INTO documents (title, body, updated_by) VALUES ($1, $2, $3) RETURNING *',
    [title, body, userId],
  );
  return rows[0];
}

export async function getDocument(id: string): Promise<Document | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await pool.query<Document>('SELECT * FROM documents WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// The whole topic is the WHERE clause. Check and increment are ONE statement,
// so there is no gap for another request to land in. Under Postgres's default
// READ COMMITTED isolation a concurrent UPDATE of the same row blocks on the
// row lock until the first transaction commits, then re-evaluates its WHERE
// against the new row version: `version = $5` is now false, so it matches 0 rows.
export async function updateDocument(
  id: string,
  patch: { title: string; body: string },
  baseVersion: number,
  userId: string,
): Promise<UpdateResult> {
  if (!UUID_RE.test(id)) return { status: 'not_found' };

  const { rows } = await pool.query<Document>(
    `UPDATE documents
        SET title = $1, body = $2, version = version + 1, updated_by = $3, updated_at = now()
      WHERE id = $4 AND version = $5
  RETURNING *`,
    [patch.title, patch.body, userId, id, baseVersion],
  );
  if (rows[0]) return { status: 'ok', document: rows[0] };

  // 0 rows: the id is unknown (404) or the version moved on (409). This second
  // query only classifies the failure and fetches the current row for the
  // response; it is not part of the check, so it does not reopen the race.
  const current = await getDocument(id);
  return current ? { status: 'conflict', current } : { status: 'not_found' };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// FLAWED ON PURPOSE: check-then-act. The version is compared in JS and the
// UPDATE has no `AND version = ...` guard, so two requests that both read v1
// both pass the check and both write; the second silently overwrites the first.
// gapMs widens the window so the race reproduces every time instead of rarely.
export async function updateDocumentNaive(
  id: string,
  patch: { title: string; body: string },
  baseVersion: number,
  userId: string,
  gapMs = 50,
): Promise<UpdateResult> {
  const current = await getDocument(id);
  if (!current) return { status: 'not_found' };
  if (current.version !== baseVersion) return { status: 'conflict', current };

  await sleep(gapMs);

  const { rows } = await pool.query<Document>(
    `UPDATE documents
        SET title = $1, body = $2, version = version + 1, updated_by = $3, updated_at = now()
      WHERE id = $4
  RETURNING *`,
    [patch.title, patch.body, userId, id],
  );
  return { status: 'ok', document: rows[0] };
}
