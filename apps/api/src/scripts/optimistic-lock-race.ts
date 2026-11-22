// Walks the Week 5 test plan against a running API (Redis + Postgres up):
//   JWT_PRIVATE_KEY="$(cat private.pem)" pnpm --filter api exec tsx src/scripts/optimistic-lock-race.ts
// BASE defaults to http://localhost:4100. ROUNDS (default 50) sets the race repetitions.
import assert from 'node:assert/strict';
import { SignJWT, importPKCS8 } from 'jose';

const BASE = process.env.BASE ?? 'http://localhost:4100';
const ROUNDS = Number(process.env.ROUNDS ?? 50);
const ROUTE = `${BASE}/topics/optimistic-locking/documents`;

const key = await importPKCS8(process.env.JWT_PRIVATE_KEY!, 'RS256');
const mint = (sub: string) =>
  new SignJWT({ role: 'Responder', organizationId: 'org_demo' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(sub)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);

const [alice, bob] = await Promise.all([mint('alice'), mint('bob')]);

type Doc = { id: string; title: string; body: string; version: number; updated_by: string };
const call = async (method: string, path: string, token: string, body?: unknown) => {
  const res = await fetch(`${ROUTE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
};
const create = async (title = 'doc') => (await call('POST', '/', alice, { title, body: 'v1' })).json as Doc;
const put = (id: string, token: string, edit: object, variant: '' | '/naive' = '') =>
  call('PUT', `/${id}${variant}`, token, edit);

// 1. Basic contract: create, read, guarded write, stale write
{
  const doc = await create();
  assert.equal(doc.version, 1);
  assert.deepEqual((await call('GET', `/${doc.id}`, alice)).json, doc);

  const ok = await put(doc.id, alice, { title: 'a', body: 'from alice', baseVersion: 1 });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.version, 2);
  assert.equal(ok.json.updated_by, 'alice');

  const stale = await put(doc.id, bob, { title: 'b', body: 'from bob', baseVersion: 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error, 'version_conflict');
  assert.equal(stale.json.current.version, 2);
  assert.equal(stale.json.current.updated_by, 'alice'); // tells the client who beat them
  assert.equal((await call('GET', `/${doc.id}`, alice)).json.body, 'from alice'); // row unchanged
  console.log('ok  create/read, guarded write bumps version, stale write -> 409 with current row');

  // 2. Error classification
  const missing = await put(crypto.randomUUID(), alice, { title: 't', body: '', baseVersion: 1 });
  assert.equal(missing.status, 404); // unknown id is NOT a conflict
  assert.equal((await put('not-a-uuid', alice, { title: 't', body: '', baseVersion: 1 })).status, 404);
  assert.equal((await put(doc.id, alice, { title: 't', body: '' })).status, 400);
  assert.equal((await put(doc.id, alice, { title: 't', body: '', baseVersion: '2' })).status, 400);
  console.log('ok  unknown/malformed id -> 404, missing/non-integer baseVersion -> 400');

  // 3. Client recovery: take `current` from the 409, reapply on top, retry with the new base
  const retry = await put(doc.id, bob, {
    title: 'b',
    body: `${stale.json.current.body} + from bob`,
    baseVersion: stale.json.current.version,
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.json.version, 3);
  console.log('ok  after a 409, reapplying on the returned current row and retrying succeeds');
}

// 4. The race: two writers, same baseVersion, fired at the same instant
async function race(variant: '' | '/naive') {
  let bothSucceeded = 0;
  let exactlyOne = 0;
  let finalVersions = new Set<number>();
  let winnerMatches = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const doc = await create(`race-${i}`);
    const [a, b] = await Promise.all([
      put(doc.id, alice, { title: 'a', body: 'alice', baseVersion: 1 }, variant),
      put(doc.id, bob, { title: 'b', body: 'bob', baseVersion: 1 }, variant),
    ]);
    const statuses = [a.status, b.status].sort();
    if (statuses[0] === 200 && statuses[1] === 200) bothSucceeded++;
    if (statuses[0] === 200 && statuses[1] === 409) exactlyOne++;
    const final = (await call('GET', `/${doc.id}`, alice)).json as Doc;
    finalVersions.add(final.version);
    const winner = a.status === 200 ? 'alice' : b.status === 200 ? 'bob' : null;
    if (winner && final.body === winner) winnerMatches++;
  }
  return { bothSucceeded, exactlyOne, finalVersions: [...finalVersions], winnerMatches };
}

const naive = await race('/naive');
assert.equal(naive.bothSucceeded, ROUNDS, 'naive route should accept both writers every round');
console.log(
  `ok  NAIVE route: both writers got 200 in ${naive.bothSucceeded}/${ROUNDS} rounds ` +
    `(final versions ${naive.finalVersions}: bumped twice from v1, one edit silently lost)`,
);

const guarded = await race('');
assert.equal(guarded.exactlyOne, ROUNDS, 'guarded route must give exactly one 200 and one 409 every round');
assert.equal(guarded.bothSucceeded, 0);
assert.deepEqual(guarded.finalVersions, [2]); // base + 1, never base + 2
assert.equal(guarded.winnerMatches, ROUNDS); // stored body is the winner's, not the loser's
console.log(`ok  GUARDED route: exactly one 200 and one 409 in ${ROUNDS}/${ROUNDS} rounds, final version always 2, stored body is the winner's`);
