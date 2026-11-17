// Run two API instances against one Redis, then:
//   JWT_PRIVATE_KEY=... pnpm tsx src/scripts/websocket-smoke.ts
// Expects instances on :4101 and :4102 (PORT=4101 / PORT=4102 pnpm dev).
// SKIP_TTL=1 skips the ~50s wait for the presence TTL to expire.
import assert from 'node:assert/strict';
import { SignJWT, importPKCS8 } from 'jose';
import { io, type Socket } from 'socket.io-client';

const A = 'http://localhost:4101';
const B = 'http://localhost:4102';
const key = await importPKCS8(process.env.JWT_PRIVATE_KEY!, 'RS256');
const mint = (sub: string) =>
  new SignJWT({ role: 'Responder', organizationId: 'org_demo' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(sub)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);

const connect = (url: string, token?: string) =>
  new Promise<Socket>((resolve, reject) => {
    const s = io(url, { auth: token === undefined ? {} : { token }, reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => (s.close(), reject(e)));
  });

const collect = (s: Socket, ev: string) => {
  const seen: any[] = [];
  s.on(ev, (p) => seen.push(p));
  return seen;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const [tA, tB, tC] = await Promise.all([mint('alice'), mint('bob'), mint('carol')]);

// 1. handshake: valid ok, missing / tampered rejected before 'connection'
const alice = await connect(A, tA);
const bob = await connect(B, tB); // different instance on purpose
const carol = await connect(A, tC); // never joins
await assert.rejects(connect(A), { message: 'unauthorized' });
await assert.rejects(connect(A, tA.slice(0, -4) + 'AAAA'), { message: 'unauthorized' });
console.log('ok  handshake: valid accepted, missing/tampered rejected');

// 2. fan-out across instances: REST on A -> room members on A and B, not carol
const updates = { alice: collect(alice, 'incident:updated'), bob: collect(bob, 'incident:updated'), carol: collect(carol, 'incident:updated') };
const presence = collect(alice, 'presence:changed');
await alice.emitWithAck('incident:join', 'inc-1');
await bob.emitWithAck('incident:join', 'inc-1');
const res = await fetch(`${A}/topics/websockets/incidents/inc-1/update`, {
  method: 'POST',
  headers: { authorization: `Bearer ${tA}`, 'content-type': 'application/json' },
  body: JSON.stringify({ status: 'mitigated' }),
});
assert.equal(((await res.json()) as any).roomMembers, 2); // counted across both instances
await sleep(300);
assert.equal(updates.alice.length, 1);
assert.equal(updates.bob.length, 1); // reached bob on the OTHER instance = redis adapter working
assert.equal(updates.carol.length, 0);
console.log('ok  room fan-out crosses instances; non-member gets nothing');

if (process.env.SKIP_TTL) process.exit(0);

// 3. ungraceful drop: presence survives the disconnect, then expires and is announced once
bob.io.engine.close(); // transport dies, no incident:leave
await sleep(500);
const present = async () => ((await (await fetch(`${A}/topics/redis-presence/inc-1/present`)).json()) as any).present as string[];
assert.ok((await present()).includes('bob'), 'bob should still be present right after the drop');
const t0 = Date.now();
while (!presence.some((p) => p.userId === 'bob' && p.status === 'offline')) {
  assert.ok(Date.now() - t0 < 70_000, 'no offline event within 70s');
  await sleep(500);
}
console.log(`ok  presence outlived the drop, offline announced after ${Math.round((Date.now() - t0) / 1000)}s`);
await sleep(7_000); // two more sweep cycles on each instance
assert.equal(presence.filter((p) => p.userId === 'bob' && p.status === 'offline').length, 1);
assert.ok(!(await present()).includes('bob'));
console.log('ok  offline announced exactly once across both instances');

[alice, carol].forEach((s) => s.close());
